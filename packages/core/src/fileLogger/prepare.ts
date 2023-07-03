import fs from 'fs';
import { PATH, PROCESSNAME, PrepareFile, Poolinfo, OrgInfo, ExternalDependency, PoolDefinition } from './types';

export class FileLoggerService {
    public static writePoolDefinition(poolDefinition: PoolDefinition): void {
        PrepareFileBuilder.getInstance().buildPoolDefinition(poolDefinition).build();
    }

    public static writePoolInfo(activeOrgs: number, maxOrgs: number): void {
        const poolInfo: Poolinfo = {
            activeOrgs: activeOrgs,
            maxOrgs: maxOrgs,
            prepareDuration: 0,
            orgInfos: [],
        };
        PrepareFileBuilder.getInstance().buildPoolinfo(poolInfo).build();
    }

    public static writePoolError(success: number, failed: number, message: string, errorCode: string): void {
        PrepareFileBuilder.getInstance().buildPoolError(success, failed, message, errorCode).build();
    }

    public static writeExternalDependency(
        order: number,
        pck: string,
        version: string,
        subscriberVersionId: string
    ): void {
        PrepareFileBuilder.getInstance()
            .buildExternalDependencies({
                order: order,
                pck: pck,
                version: version,
                subscriberVersionId: subscriberVersionId,
            })
            .build();
    }

    public static writeReleaseConfig(releaseConfig: string[]): void {
        PrepareFileBuilder.getInstance().buildReleaseConfig(releaseConfig).build();
    }

    public static writeOrgInfo(index: number, orgInfo: OrgInfo): void {
        PrepareFileBuilder.getInstance().buildOrgInfo(index, orgInfo).build();
    }
}

class PrepareFileBuilder {
    private file: PrepareFile;
    private static instance: PrepareFileBuilder;

    private constructor() {
        this.file = {
            processName: PROCESSNAME.PREPARE,
            success: 0,
            failed: 0,
            status: 'inprogress',
            message: '',
            errorCode: '',
            poolDefinition: {tag: '', maxAllocation: 0},
            poolInfo: { activeOrgs: 0, maxOrgs: 0, prepareDuration: 0, orgInfos: [] },
            externalDependencies: []
        };
    }

    public static getInstance(): PrepareFileBuilder {
        if (!PrepareFileBuilder.instance) {
            PrepareFileBuilder.instance = new PrepareFileBuilder();
            // Create .sfpowerscripts folder if not exist
            if (!fs.existsSync(PATH.DEFAULT)) {
                fs.mkdirSync(PATH.DEFAULT);
            }
            if (!fs.existsSync(PATH.PREPARE)) {
                // File doesn't exist, create it
                fs.writeFileSync(PATH.PREPARE, JSON.stringify(PrepareFileBuilder.instance.file), 'utf-8');
            }
        }

        return PrepareFileBuilder.instance;
    }

    buildPoolError(success: number, failed: number, message: string, errorCode: string): PrepareFileBuilder {
        this.file.success = success;
        this.file.failed = failed;
        this.file.status = 'failed';
        this.file.message = message;
        this.file.errorCode = errorCode;
        return this;
    }

    buildPoolDefinition(poolDefinition: PoolDefinition): PrepareFileBuilder {
        this.file.poolDefinition = poolDefinition;
        return this; 
    }

    buildPoolinfo(poolInfo: Poolinfo): PrepareFileBuilder {
        this.file.poolInfo = poolInfo;
        return this;
    }

    buildOrgInfo(index: number, orgInfo: OrgInfo): PrepareFileBuilder {
        this.file.poolInfo.orgInfos[index] = orgInfo;
        return this;
    }

    buildExternalDependencies(externalDependency: ExternalDependency): PrepareFileBuilder {
        this.file.externalDependencies.push(externalDependency);
        return this;
    }

    buildReleaseConfig(releaseConfig: string[]): PrepareFileBuilder {
        this.file.releaseConfig = releaseConfig;
        return this;
    }

    build(): void {
        fs.writeFileSync(PATH.PREPARE, JSON.stringify(this.file, null, 2), 'utf-8');
    }
}