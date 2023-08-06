// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile, JsonSchema, FileSystem } from '@rushstack/node-core-library';

import { ExpressionJson } from './SelectorExpressionJson';
import schemaJson from '../schemas/selector-expression.schema.json';

/**
 * A utility class for saving and loading selector expression JSON files.
 */
export class SelectorExpressionJsonFile {
  private static _jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

  public static async loadAsync(jsonFilePath: string): Promise<ExpressionJson> {
    const json: ExpressionJson = await JsonFile.loadAndValidateAsync(
      jsonFilePath,
      SelectorExpressionJsonFile._jsonSchema
    );
    return json;
  }

  public static async tryLoadAsync(jsonFilePath: string): Promise<ExpressionJson | undefined> {
    try {
      return await this.loadAsync(jsonFilePath);
    } catch (error) {
      if (FileSystem.isNotExistError(error as Error)) {
        return undefined;
      }
      throw error;
    }
  }
}
