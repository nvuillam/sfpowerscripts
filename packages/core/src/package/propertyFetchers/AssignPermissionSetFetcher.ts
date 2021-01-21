import SFPPackage  from "../SFPPackage";
import PropertyFetcher from "./PropertyFetcher"


export default class AssignPermissionSetFetcher implements PropertyFetcher {

  public getSfpowerscriptsProperties(
    packageContents: SFPPackage,
    packageLogger?: any
  ) {
    if (packageContents.packageDescriptor.assignPermSetsPreDeployment) {
      if (
        packageContents.packageDescriptor.assignPermSetsPreDeployment instanceof
        Array
      ) {
        packageContents.assignPermSetsPreDeployment =
          packageContents.packageDescriptor.assignPermSetsPreDeployment;
      }
      else
        throw new Error(
          "Property 'assignPermSetsPreDeployment' must be of type array"
        );
    }

    if (packageContents.packageDescriptor.assignPermSetsPostDeployment) {
      if (
        packageContents.packageDescriptor
          .assignPermSetsPostDeployment instanceof Array
      ) {
        packageContents.assignPermSetsPostDeployment =
          packageContents.packageDescriptor.assignPermSetsPostDeployment;
      }
      else
        throw new Error(
          "Property 'assignPermSetsPostDeployment' must be of type array"
        );
    }

    return packageContents;
  }
}