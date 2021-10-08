// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';

import { JsonFile, FileSystem, InternalError } from '@rushstack/node-core-library';

import { BaseShrinkwrapFile } from '../base/BaseShrinkwrapFile';
import { DependencySpecifier } from '../DependencySpecifier';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { BaseProjectShrinkwrapFile } from '../base/BaseProjectShrinkwrapFile';

interface INpmShrinkwrapDependencyJson {
  version: string;
  from: string;
  resolved: string;
  dependencies: { [dependency: string]: INpmShrinkwrapDependencyJson };
}

interface INpmShrinkwrapJson {
  name: string;
  version: string;
  dependencies: { [dependency: string]: INpmShrinkwrapDependencyJson };
}

export class NpmShrinkwrapFile extends BaseShrinkwrapFile {
  public readonly isWorkspaceCompatible: boolean;
  private _shrinkwrapJson: INpmShrinkwrapJson;

  private constructor(shrinkwrapJson: INpmShrinkwrapJson) {
    super();
    this._shrinkwrapJson = shrinkwrapJson;

    // Normalize the data
    if (!this._shrinkwrapJson.version) {
      this._shrinkwrapJson.version = '';
    }
    if (!this._shrinkwrapJson.name) {
      this._shrinkwrapJson.name = '';
    }
    if (!this._shrinkwrapJson.dependencies) {
      this._shrinkwrapJson.dependencies = {};
    }

    // Workspaces not supported in NPM
    this.isWorkspaceCompatible = false;
  }

  public static loadFromFile(shrinkwrapJsonFilename: string): NpmShrinkwrapFile | undefined {
    let data: string | undefined = undefined;
    try {
      if (!FileSystem.exists(shrinkwrapJsonFilename)) {
        return undefined; // file does not exist
      }

      // We don't use JsonFile/jju here because shrinkwrap.json is a special NPM file format
      // and typically very large, so we want to load it the same way that NPM does.
      data = FileSystem.readFile(shrinkwrapJsonFilename);
      if (data.charCodeAt(0) === 0xfeff) {
        // strip BOM
        data = data.slice(1);
      }

      return new NpmShrinkwrapFile(JSON.parse(data));
    } catch (error) {
      throw new Error(
        `Error reading "${shrinkwrapJsonFilename}":` + os.EOL + `  ${(error as Error).message}`
      );
    }
  }

  /** @override */
  public getTempProjectNames(): ReadonlyArray<string> {
    return this._getTempProjectNames(this._shrinkwrapJson.dependencies);
  }

  /** @override */
  protected serialize(): string {
    return JsonFile.stringify(this._shrinkwrapJson);
  }

  /** @override */
  protected getTopLevelDependencyVersion(dependencyName: string): DependencySpecifier | undefined {
    // First, check under tempProjectName, as this is the first place we look during linking.
    const dependencyJson: INpmShrinkwrapDependencyJson | undefined = NpmShrinkwrapFile.tryGetValue(
      this._shrinkwrapJson.dependencies,
      dependencyName
    );

    if (!dependencyJson) {
      return undefined;
    }

    return new DependencySpecifier(dependencyName, dependencyJson.version);
  }

  /**
   * @param dependencyName the name of the dependency to get a version for
   * @param tempProjectName the name of the temp project to check for this dependency
   * @param versionRange Not used, just exists to satisfy abstract API contract
   * @override
   */
  protected tryEnsureDependencyVersion(
    dependencySpecifier: DependencySpecifier,
    tempProjectName: string
  ): DependencySpecifier | undefined {
    // First, check under tempProjectName, as this is the first place we look during linking.
    let dependencyJson: INpmShrinkwrapDependencyJson | undefined = undefined;

    const tempDependency: INpmShrinkwrapDependencyJson | undefined = NpmShrinkwrapFile.tryGetValue(
      this._shrinkwrapJson.dependencies,
      tempProjectName
    );
    if (tempDependency && tempDependency.dependencies) {
      dependencyJson = NpmShrinkwrapFile.tryGetValue(
        tempDependency.dependencies,
        dependencySpecifier.packageName
      );
    }

    // Otherwise look at the root of the shrinkwrap file
    if (!dependencyJson) {
      return this.getTopLevelDependencyVersion(dependencySpecifier.packageName);
    }

    return new DependencySpecifier(dependencySpecifier.packageName, dependencyJson.version);
  }

  /** @override */
  public getProjectShrinkwrap(project: RushConfigurationProject): BaseProjectShrinkwrapFile | undefined {
    return undefined;
  }

  /** @override */
  public isWorkspaceProjectModified(project: RushConfigurationProject, variant?: string): boolean {
    throw new InternalError('Not implemented');
  }
}
