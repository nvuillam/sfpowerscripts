import SFPLogger, { Logger, LoggerLevel } from '../../logger/SFPLogger';
import { PackageInstallationResult, PackageInstallationStatus } from './PackageInstallationResult';
import PackageMetadata from '../../PackageMetadata';
import ProjectConfig from '../../project/ProjectConfig';
import SFPStatsSender from '../../stats/SFPStatsSender';
import PackageInstallationHelpers from './PackageInstallationHelpers';
import { Connection } from '@salesforce/core';
import * as fs from 'fs-extra';
import { convertAliasToUsername } from '../../utils/AliasList';
import FileSystem from '../../utils/FileSystem';
import OrgDetailsFetcher from '../../org/OrgDetailsFetcher';
import path = require('path');
import PermissionSetGroupUpdateAwaiter from '../../permsets/PermissionSetGroupUpdateAwaiter';
import SFPOrg from '../../org/SFPOrg';

export abstract class InstallPackage {
    private startTime: number;
    protected connection: Connection;
    protected packageDescriptor;
    protected packageDirectory;
    protected org: SFPOrg;
    private _isArtifactToBeCommittedInOrg: boolean = true;

    public constructor(
        protected sfdxPackage: string,
        protected targetusername: string,
        protected sourceDirectory: string,
        protected packageMetadata: PackageMetadata,
        protected skipIfPackageInstalled: boolean,
        protected logger: Logger,
        protected isDryRun: boolean
    ) {}

    public async exec(): Promise<PackageInstallationResult> {
        try {
            this.startTime = Date.now();

            this.packageDescriptor = ProjectConfig.getSFDXPackageDescriptor(this.sourceDirectory, this.sfdxPackage);

            let targetUsername = await convertAliasToUsername(this.targetusername);
            this.org = await SFPOrg.create({ aliasOrUsername: targetUsername });
            this.connection = this.org.getConnection();

            if (await this.isPackageToBeInstalled(this.skipIfPackageInstalled)) {
                if (!this.isDryRun) {
                    //Package Has Permission Set Group
                    if (this.packageMetadata.isPermissionSetGroupFound)
                        await this.waitTillAllPermissionSetGroupIsUpdated();
                    await this.preInstall();
                    await this.getPackageDirectoryForAliasifiedPackages();
                    await this.install();
                    await this.postInstall();
                    await this.commitPackageInstallationStatus();
                    this.sendMetricsWhenSuccessfullyInstalled();
                }
                return { result: PackageInstallationStatus.Succeeded };
            } else {
                SFPLogger.log('Skipping Package Installation', LoggerLevel.INFO, this.logger);
                return { result: PackageInstallationStatus.Skipped };
            }
        } catch (error) {
            this.sendMetricsWhenFailed();
            return {
                result: PackageInstallationStatus.Failed,
                message: error.message,
            };
        }
    }

    private async waitTillAllPermissionSetGroupIsUpdated() {
        let permissionSetGroupUpdateAwaiter: PermissionSetGroupUpdateAwaiter = new PermissionSetGroupUpdateAwaiter(
            this.connection,
            this.logger
        );
        await permissionSetGroupUpdateAwaiter.waitTillAllPermissionSetGroupIsUpdated();
    }

    protected async getPackageDirectoryForAliasifiedPackages() {
        if (this.packageDescriptor.aliasfy) {
            const searchDirectory = path.join(this.sourceDirectory, this.packageDescriptor.path);
            const files = FileSystem.readdirRecursive(searchDirectory, true);

            let aliasDir: string;

            aliasDir = files.find(
                (file) =>
                    path.basename(file) === this.targetusername &&
                    fs.lstatSync(path.join(searchDirectory, file)).isDirectory()
            );

            if (!aliasDir) {
                const orgDetails = await new OrgDetailsFetcher(this.targetusername).getOrgDetails();

                if (orgDetails.isSandbox) {
                    // If the target org is a sandbox, find a 'default' directory to use as package directory
                    aliasDir = files.find(
                        (file) =>
                            path.basename(file) === 'default' &&
                            fs.lstatSync(path.join(searchDirectory, file)).isDirectory()
                    );
                }
            }

            if (!aliasDir) {
                throw new Error(
                    `Aliasfied package '${this.sfdxPackage}' does not have an alias with '${this.targetusername}'' or 'default' directory`
                );
            }

            this.packageDirectory = path.join(this.packageDescriptor.path, aliasDir);
        } else {
            this.packageDirectory = path.join(this.packageDescriptor['path']);
        }

        let absPackageDirectory: string = path.join(this.sourceDirectory, this.packageDirectory);
        if (!fs.existsSync(absPackageDirectory)) {
            throw new Error(`Package directory ${absPackageDirectory} does not exist`);
        }
    }

    private sendMetricsWhenFailed() {
        SFPStatsSender.logCount('package.installation.failure', {
            package: this.packageMetadata.package_name,
            type: this.packageMetadata.package_type,
            target_org: this.targetusername,
        });
    }

    private sendMetricsWhenSuccessfullyInstalled() {
        let elapsedTime = Date.now() - this.startTime;
        SFPStatsSender.logElapsedTime('package.installation.elapsed_time', elapsedTime, {
            package: this.packageMetadata.package_name,
            type: this.packageMetadata.package_type,
            target_org: this.targetusername,
        });
        SFPStatsSender.logCount('package.installation', {
            package: this.packageMetadata.package_name,
            type: this.packageMetadata.package_type,
            target_org: this.targetusername,
        });
    }

    //Set this to disable whethere info about the artifact has to be recorded in the org
    public set isArtifactToBeCommittedInOrg(toCommit: boolean) {
        this._isArtifactToBeCommittedInOrg = toCommit;
    }

    private async commitPackageInstallationStatus() {
        if (this._isArtifactToBeCommittedInOrg) {
            try {
                await this.org.updateArtifactInOrg(this.logger, this.packageMetadata);
            } catch (error) {
                SFPLogger.log(
                    'Unable to commit information about the package into org..Check whether prerequisities are installed',
                    LoggerLevel.WARN,
                    this.logger
                );
            }
        }
    }

    protected async isPackageToBeInstalled(skipIfPackageInstalled: boolean): Promise<boolean> {
        if (skipIfPackageInstalled) {
            let installationStatus = await this.org.isArtifactInstalledInOrg(this.logger, this.packageMetadata);
            return !installationStatus.isInstalled;
        } else return true; // Always install packages if skipIfPackageInstalled is false
    }

    public async preInstall() {
        let preDeploymentScript: string = path.join(this.sourceDirectory, `scripts`, `preDeployment`);

        if (this.packageMetadata.assignPermSetsPreDeployment) {
            SFPLogger.log('Assigning permission sets before deployment:', LoggerLevel.INFO, this.logger);

            await PackageInstallationHelpers.applyPermsets(
                this.packageMetadata.assignPermSetsPreDeployment,
                this.connection,
                this.sourceDirectory,
                this.logger
            );
        }

        if (fs.existsSync(preDeploymentScript)) {
            SFPLogger.log('Executing preDeployment script');
            await PackageInstallationHelpers.executeScript(
                preDeploymentScript,
                this.sfdxPackage,
                this.targetusername,
                this.logger
            );
        }
    }

    abstract install();

    public async postInstall() {
        let postDeploymentScript: string = path.join(this.sourceDirectory, `scripts`, `postDeployment`);

        if (this.packageMetadata.assignPermSetsPostDeployment) {
            SFPLogger.log('Assigning permission sets after deployment:', LoggerLevel.INFO, this.logger);

            await PackageInstallationHelpers.applyPermsets(
                this.packageMetadata.assignPermSetsPostDeployment,
                this.connection,
                this.sourceDirectory,
                this.logger
            );
        }

        if (fs.existsSync(postDeploymentScript)) {
            SFPLogger.log('Executing postDeployment script');
            await PackageInstallationHelpers.executeScript(
                postDeploymentScript,
                this.sfdxPackage,
                this.targetusername,
                this.logger
            );
        }
    }
}
