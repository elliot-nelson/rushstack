// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from './RushConfiguration';
import { RushConfigurationProject } from './RushConfigurationProject';
import { Selection } from '../logic/Selection';
import type { ISelectorParser } from '../logic/selectors/ISelectorParser';
import type { ITerminal } from '@rushstack/node-core-library';
import {
  GitChangedProjectSelectorParser,
  IGitSelectorParserOptions
} from '../logic/selectors/GitChangedProjectSelectorParser';
import { NamedProjectSelectorParser } from '../logic/selectors/NamedProjectSelectorParser';
import { TagProjectSelectorParser } from '../logic/selectors/TagProjectSelectorParser';
import { VersionPolicyProjectSelectorParser } from '../logic/selectors/VersionPolicyProjectSelectorParser';
import { JsonFileSelectorParser } from '../logic/selectors/JsonFileSelectorParser';
import { SelectorError } from '../logic/selectors/SelectorError';

import { ExpressionJson, ISelectorJson, IFilterJson, IOperatorJson } from './SelectorExpressionJson';

/**
 * When preparing to select projects in a Rush monorepo, some selector scopes
 * require additional configuration in order to control their behavior. This
 * options interface allows the caller to provide these properties.
 */
export interface IProjectSelectionOptions {
  /**
   * Options required for configuring the git selector scope.
   */
  gitSelectorParserOptions: IGitSelectorParserOptions;
}

/**
 * A central interface for selecting a subset of Rush projects from a given monorepo,
 * using standardized selector expressions. Note that the types of selectors available
 * in a monorepo may be influenced in the future by plugins, so project selection
 * is always done in the context of a particular Rush configuration.
 */
export class RushProjectSelector {
  private _rushConfig: RushConfiguration;
  private _scopes: Map<string, ISelectorParser<RushConfigurationProject>> = new Map();
  private _options: IProjectSelectionOptions;

  public constructor(rushConfig: RushConfiguration, options: IProjectSelectionOptions) {
    this._rushConfig = rushConfig;
    this._options = options;

    this._scopes.set('name', new NamedProjectSelectorParser(this._rushConfig));
    this._scopes.set(
      'git',
      new GitChangedProjectSelectorParser(this._rushConfig, this._options.gitSelectorParserOptions)
    );
    this._scopes.set('tag', new TagProjectSelectorParser(this._rushConfig));
    this._scopes.set('version-policy', new VersionPolicyProjectSelectorParser(this._rushConfig));
    this._scopes.set('json', new JsonFileSelectorParser(this._rushConfig, this));
  }

  /**
   * Select a set of projects using the passed selector expression. The passed context string
   * is used only when constructing error messages, in the event of an error in user input.
   */
  public async selectExpression(expr: ExpressionJson, context: string): Promise<RushConfigurationProject[]> {
    if (RushProjectSelector._isSelector(expr)) {
      return this._evaluateSelector(expr, context);
    } else if (RushProjectSelector._isFilter(expr)) {
      return this._evaluateFilter(expr, context);
    } else if (RushProjectSelector._isOperator(expr)) {
      return this._evaluateOperator(expr, context);
    } else {
      // Fail-safe... in general, this shouldn't be possible, as user script type checking
      // or JSON schema validation should catch it before this point.
      throw new SelectorError(`Invalid object encountered in selector expression in ${context}.`);
    }
  }

  private async _evaluateSelector(
    selector: ISelectorJson,
    context: string
  ): Promise<RushConfigurationProject[]> {
    const parser: ISelectorParser<RushConfigurationProject> | undefined = this._scopes.get(selector.scope);
    if (!parser) {
      throw new SelectorError(
        `Unknown selector scope '${selector.scope}' for value '${selector.value}' in ${context}.`
      );
    }
    return [
      ...(await parser.evaluateSelectorAsync({
        unscopedSelector: selector.value,
        terminal: undefined as unknown as ITerminal,
        context: context
      }))
    ];
  }

  private async _evaluateFilter(expr: IFilterJson, context: string): Promise<RushConfigurationProject[]> {
    if (expr.filter === 'to') {
      const arg: RushConfigurationProject[] = await this.selectExpression(expr.arg, context);
      return [...Selection.expandAllDependencies(arg)];
    } else if (expr.filter === 'from') {
      const arg: RushConfigurationProject[] = await this.selectExpression(expr.arg, context);
      return [...Selection.expandAllDependencies(Selection.expandAllConsumers(arg))];
    } else if (expr.filter === 'only') {
      // "only" is sort of a no-op in a generic selector expression
      const arg: RushConfigurationProject[] = await this.selectExpression(expr.arg, context);
      return arg;
    } else {
      throw new SelectorError(
        `Unknown filter '${expr.filter}' encountered in selector expression in ${context}.`
      );
    }
  }

  private async _evaluateOperator(expr: IOperatorJson, context: string): Promise<RushConfigurationProject[]> {
    if (expr.op === 'not') {
      // Built-in operator
      const result: RushConfigurationProject[] = await this.selectExpression(expr.args[0], context);
      return this._rushConfig.projects.filter((p) => !result.includes(p));
    } else if (expr.op === 'and') {
      // Built-in operator
      return [
        ...Selection.intersection(
          new Set(await this.selectExpression(expr.args[0], context)),
          new Set(await this.selectExpression(expr.args[1], context))
        )
      ];
    } else if (expr.op === 'or') {
      // Built-in operator
      return [
        ...Selection.union(
          new Set(await this.selectExpression(expr.args[0], context)),
          new Set(await this.selectExpression(expr.args[1], context))
        )
      ];
    } else {
      throw new SelectorError(`Unknown operator '${expr.op}' in selector expression in ${context}.`);
    }
  }

  private static _isSelector(expr: ExpressionJson): expr is ISelectorJson {
    return !!(expr as ISelectorJson).scope;
  }

  private static _isFilter(expr: ExpressionJson): expr is IFilterJson {
    return !!(expr as IFilterJson).filter;
  }

  private static _isOperator(expr: ExpressionJson): expr is IOperatorJson {
    return !!(expr as IOperatorJson).op;
  }
}
