import * as Router from 'koa-router';
import _ from 'underscore';
import { Middleware } from '@ark7/router';
import { NodesworkError } from '@nodeswork/utils';
import { withInheritedProps as dotty } from 'object-path';

import * as validators from './validators';
import { Validator } from './declarations';
import { split } from './overrides';

export interface ParamError {
  path: string | number;
  value: any;
  failed: string;
  reason?: string;
}

export interface ParamsContext {
  errors?: ParamError[];
}

export interface ParamsOptions {
  [key: string]: null | Validator | Validator[];
}

export interface StandardParamsOptions {
  key: string;
  validators: Validator[];
}

export function params(options: ParamsOptions): Router.IMiddleware {
  const mappedOptions: StandardParamsOptions[] = _.map(options, (v, key) => {
    const vs: Validator[] = _.chain([v])
      .flatten()
      .filter((x) => !!x)
      .value();

    if (key.startsWith('!')) {
      vs.push(validators.required);
      key = key.substring(1);
    }

    return { key, validators: vs };
  });

  return async (
    ctx: Router.IRouterContext & ParamsContext,
    next: () => any,
  ) => {
    ctx.errors = processValidators(ctx.request, mappedOptions, ctx);
    if (!_.isEmpty(ctx.errors)) {
      throw NodesworkError.unprocessableEntity(undefined, {
        errors: ctx.errors,
      });
    } else {
      await next();
    }
  };
}

export function processValidators(
  target: any,
  standardOptions: StandardParamsOptions[],
  root: any,
): ParamError[] {
  const errors = [];
  for (const o of standardOptions) {
    const newTarget = o.key.startsWith('~') ? root : target;
    const key = o.key.startsWith('~') ? o.key.substring(1) : o.key;

    for (const fn of o.validators) {
      const value = dotty.get(newTarget, split(key));
      const pass = fn(newTarget, key, value, root);
      if (pass === false || _.isString(pass)) {
        errors.push({
          path: o.key,
          value,
          failed: fn.name,
          reason: pass || '',
        });
      }

      if (_.isArray(pass)) {
        for (const error of pass) {
          errors.push({
            path: o.key + '.' + error.path,
            value: error.value,
            failed: fn.name + '>' + error.failed,
            reason: error.reason,
          });
        }
      }
    }
  }

  return errors;
}

export const Params = (options: ParamsOptions) => {
  return Middleware(params(options));
};
