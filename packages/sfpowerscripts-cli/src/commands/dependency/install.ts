import SfpowerscriptsCommand from '../../SfpowerscriptsCommand';
import { Messages } from '@salesforce/core';
import ExternalPackage2DependencyResolver from '@dxatscale/sfpowerscripts.core/lib/package/dependencies/ExternalPackage2DependencyResolver';
import ProjectConfig from '@dxatscale/sfpowerscripts.core/lib/project/ProjectConfig';
import SFPLogger, { COLOR_KEY_MESSAGE, ConsoleLogger, LoggerLevel } from '@dxatscale/sfp-logger';
import ExternalDependencyDisplayer from '@dxatscale/sfpowerscripts.core/lib/display/ExternalDependencyDisplayer';
import InstallUnlockedPackageCollection from '@dxatscale/sfpowerscripts.core/lib/package/packageInstallers/InstallUnlockedPackageCollection';
import SFPOrg from '@dxatscale/sfpowerscripts.core/lib/org/SFPOrg';
import { Flags } from '@oclif/core';
import { loglevel, requiredDevHubFlag, requiredUserNameFlag } from '../../flags/sfdxflags';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('@dxatscale/sfpowerscripts', 'dependency_install');

export default class Install extends SfpowerscriptsCommand {
    public static description = messages.getMessage('commandDescription');
    protected static requiresUsername = true;
    protected static requiresDevhubUsername = true;
    protected static requiresProject = true;

    public static flags = {
        'targetusername': requiredUserNameFlag,
        requiredDevHubFlag,
        installationkeys: Flags.string({
            char: 'k',
            required: false,
            description: messages.getMessage('installationkeysFlagDescription'),
        }),
        loglevel
    };

    public async execute(): Promise<any> {
        // this.org is guaranteed because requiresUsername=true, as opposed to supportsUsername
        const username = this.org.getUsername();

        //Resolve external package dependencies
        let externalPackageResolver = new ExternalPackage2DependencyResolver(
            this.hubOrg.getConnection(),
            ProjectConfig.getSFDXProjectConfig(null),
            this.flags.installationkeys
        );
        let externalPackage2s = await externalPackageResolver.resolveExternalPackage2DependenciesToVersions();

        SFPLogger.log(
            `Installing external package dependencies of this project  in ${username}`,
            LoggerLevel.INFO,
            new ConsoleLogger()
        );
        //Display resolved dependenencies
        let externalDependencyDisplayer = new ExternalDependencyDisplayer(externalPackage2s, new ConsoleLogger());
        externalDependencyDisplayer.display();

        let packageCollectionInstaller = new InstallUnlockedPackageCollection(
            await SFPOrg.create({ aliasOrUsername: username }),
            new ConsoleLogger()
        );
        await packageCollectionInstaller.install(externalPackage2s, true, true);

        SFPLogger.log(
            COLOR_KEY_MESSAGE(`Successfully completed external dependencies of this ${username} in ${username}`)
        );
    }
}
