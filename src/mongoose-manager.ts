import * as mongoose from 'mongoose';
import _ from 'underscore';
import debug from 'debug';
import {
  A7Model,
  Ark7ModelMetadata,
  MetadataError,
  Model,
  ModelClass,
  runtime,
} from '@ark7/model';
import { MongoError } from 'mongodb';

import { DeepPartial } from './types';
import { Email, PhoneNumber, SSN, UUID } from './schemas';
import { MongooseKoa } from './mixins/koa';
import {
  MongooseOptionsPlugin,
  MongooseOptionsPluginOptions,
  MongoosePluginPeriod,
  TRUE_SUITABLE,
} from './plugin';
import { dataLevelProjection } from './plugins/data-level';

declare module '@ark7/model/core/model' {
  interface ID extends mongoose.Types.ObjectId {}
}

declare module 'mongoose' {
  interface Model<T extends Document, _QueryHelpers = {}> {
    mongooseManager: MongooseManager;
  }
}

const d = debug('ark7:model-mongoose:mongoose-manager');
const dMethod = debug('ark7:model-mongoose:mongoose-manager:method');
const dIndex = debug('ark7:model-mongoose:mongoose-manager:index');
const dSchema = debug('ark7:model-mongoose:mongoose-manager:schema');
const dVirtual = debug('ark7:model-mongoose:mongoose-manager:virtual');

export type ModifiedDocument<T> = Omit<DeepPartial<T>, '_id'> & {
  _id?: mongoose.Types.ObjectId;
};

export type ModifiedDocument2<T extends { new (): any }> = ModifiedDocument<
  InstanceType<T>
>;

export type ModifiedDocument3<T extends { new (): any }> = ModifiedDocument<T>;

export type TenantMap = {
  [key: string]: any;
};

export class MongooseManager {
  options: MongooseManagerOptions = {};

  private mongoose: mongoose.Mongoose;
  private mongooseOptionsMap: Map<string, MongooseOptions> = new Map();
  private mongooseInstanceMap: Map<string, mongoose.Mongoose> = new Map();
  private modelMap: Map<string, TenantMap> = new Map();

  plugins: Map<
    MongoosePluginPeriod,
    MongooseOptionsPluginOptions[]
  > = new Map();

  constructor(options: mongoose.Mongoose | MongooseManagerOptions = {}) {
    if (options instanceof mongoose.Mongoose) {
      this.mongoose = options;
      this.options = {
        mongoose: options,
      };
    } else {
      this.mongoose = mongoose;
      this.options = options as MongooseManagerOptions;
    }

    this.plugin(MongoosePluginPeriod.BEFORE_REGISTER, dataLevelProjection);
  }

  getTenantMap(name: string): TenantMap {
    return this.modelMap.get(name);
  }

  createTenantMap(name: string): TenantMap {
    if (this.modelMap.has(name)) {
      throw new Error(`Tenant ${name} has already created`);
    }

    const tenantMap: TenantMap = {};
    this.modelMap.set(name, tenantMap);
    return tenantMap;
  }

  set<T extends keyof MongooseManagerOptions>(
    key: T,
    val: MongooseManagerOptions[T],
  ) {
    this.options[key] = val;
  }

  plugin(
    period: MongoosePluginPeriod,
    plugin: MongooseOptionsPluginOptions | MongooseOptionsPlugin,
  ) {
    if (!this.plugins.has(period)) {
      this.plugins.set(period, []);
    }

    this.plugins
      .get(period)
      .push(
        _.isFunction(plugin) ? { suitable: TRUE_SUITABLE, fn: plugin } : plugin,
      );
  }

  getMongooseInstance(tenancy: string): mongoose.Mongoose {
    if (this.mongooseInstanceMap.has(tenancy)) {
      return this.mongooseInstanceMap.get(tenancy);
    }

    const mi = new mongoose.Mongoose();
    mi.connect(
      this.options.multiTenancy.uris,
      _.extend(
        {
          useNewUrlParser: true,
          useUnifiedTopology: true,
        },
        this.options.multiTenancy.options,
      ),
      (err) => {
        if (this.options.multiTenancy.onError) {
          this.options.multiTenancy.onError(err, tenancy);
        }
      },
    );
    if (this.options.multiTenancy.onMongooseInstanceCreated) {
      this.options.multiTenancy.onMongooseInstanceCreated(mi, tenancy);
    }
    this.mongooseInstanceMap.set(tenancy, mi);
    return mi;
  }

  runPlugin(period: MongoosePluginPeriod, options: MongooseOptions) {
    const plugins: MongooseOptionsPluginOptions[] =
      this.plugins.get(period) || [];

    for (const plugin of plugins) {
      if (plugin.suitable != null && !plugin.suitable(options)) {
        continue;
      }

      d(
        'run suitable plugin for period %O with function %O',
        period,
        plugin.fn,
      );

      plugin.fn(options);
    }
  }

  discriminator<
    T,
    P extends ModelClass<T>,
    T1,
    P1 extends ModelClass<T1>,
    T2,
    P2 extends ModelClass<T2>,
    T3,
    P3 extends ModelClass<T3>,
    T4,
    P4 extends ModelClass<T4>,
    T5,
    P5 extends ModelClass<T5>,
    T6,
    P6 extends ModelClass<T6>,
    T7,
    P7 extends ModelClass<T7>,
    T8,
    P8 extends ModelClass<T8>,
    T9,
    P9 extends ModelClass<T9>
  >(
    parentModel: mongoose.Model<mongoose.Document>,
    cls: P,
    options?: mongoose.SchemaOptions,
    _m1?: P1,
    _m2?: P2,
    _m3?: P3,
    _m4?: P4,
    _m5?: P5,
    _m6?: P6,
    _m7?: P7,
    _m8?: P8,
    _m9?: P9,
  ): mongoose.Model<
    mongoose.Document &
      ModifiedDocument2<P & P1 & P2 & P3 & P4 & P5 & P6 & P7 & P8 & P9>
  > &
    P &
    P1 &
    P2 &
    P3 &
    P4 &
    P5 &
    P6 &
    P7 &
    P8 &
    P9 &
    typeof MongooseKoa;

  discriminator<T, P extends ModelClass<T>>(
    parentModel: mongoose.Model<mongoose.Document>,
    cls: P,
    options: mongoose.SchemaOptions = {},
  ): mongoose.Model<mongoose.Document & ModifiedDocument2<P>> &
    P &
    typeof MongooseKoa {
    const mongooseOptions = this.getMongooseOptions(cls);
    mongooseOptions.updateMetadata(A7Model.getMetadata(MongooseKoa), this);

    this.runPlugin(MongoosePluginPeriod.BEFORE_REGISTER, mongooseOptions);

    _.each(
      _.extend({}, options, {
        toJSON: _.extend(
          {
            versionKey: false,
            flattenMaps: true,
            virtuals: true,
          },
          options.toJSON,
        ),
        toObject: _.extend(
          {
            versionKey: false,
            flattenMaps: true,
            virtuals: true,
          },
          options.toObject,
        ),
      }),
      (value, key: keyof mongoose.SchemaOptions) => {
        (mongooseOptions.mongooseSchema as mongoose.Schema).set(key, value);
      },
    );

    if (!this.options.multiTenancy?.enabled) {
      const model = parentModel.discriminator(
        mongooseOptions.name,
        mongooseOptions.mongooseSchema as mongoose.Schema,
      );

      model.mongooseManager = this;

      return model as any;
    }

    const parentTenantMap = this.getTenantMap(parentModel.modelName);

    const tenantMap = this.createTenantMap(mongooseOptions.name);

    for (const tenancy of this.tenants) {
      const m = parentTenantMap[tenancy];

      const model = m.discriminator(
        mongooseOptions.name,
        mongooseOptions.mongooseSchema as mongoose.Schema,
      );

      model.mongooseManager = this;
      tenantMap[tenancy] = model;
    }

    return this.createProxy(tenantMap);
  }

  register<
    T,
    P extends ModelClass<T>,
    T1,
    P1 extends ModelClass<T1>,
    T2,
    P2 extends ModelClass<T2>,
    T3,
    P3 extends ModelClass<T3>,
    T4,
    P4 extends ModelClass<T4>,
    T5,
    P5 extends ModelClass<T5>,
    T6,
    P6 extends ModelClass<T6>,
    T7,
    P7 extends ModelClass<T7>,
    T8,
    P8 extends ModelClass<T8>,
    T9,
    P9 extends ModelClass<T9>
  >(
    cls: P,
    options?: mongoose.SchemaOptions,
    _m1?: P1,
    _m2?: P2,
    _m3?: P3,
    _m4?: P4,
    _m5?: P5,
    _m6?: P6,
    _m7?: P7,
    _m8?: P8,
    _m9?: P9,
  ): mongoose.Model<
    mongoose.Document<mongoose.Types.ObjectId> &
      DeepPartial<
        InstanceType<P> & InstanceType<P1> & InstanceType<P2> & InstanceType<P3>
      >
  > &
    P &
    P1 &
    P2 &
    P3 &
    P4 &
    P5 &
    P6 &
    P7 &
    P8 &
    P9 &
    typeof MongooseKoa;

  register<T, P extends ModelClass<T>>(
    cls: P,
    options: mongoose.SchemaOptions = {},
  ): mongoose.Model<
    mongoose.Document<mongoose.Types.ObjectId> & ModifiedDocument2<P>
  > &
    P &
    typeof MongooseKoa {
    const mongooseOptions = this.getMongooseOptions(cls);

    mongooseOptions.updateMetadata(A7Model.getMetadata(MongooseKoa), this);

    this.runPlugin(MongoosePluginPeriod.BEFORE_REGISTER, mongooseOptions);

    _.each(
      _.extend({}, options, {
        toJSON: _.extend(
          {
            versionKey: false,
            flattenMaps: true,
            virtuals: true,
          },
          options.toJSON,
        ),
        toObject: _.extend(
          {
            versionKey: false,
            flattenMaps: true,
            virtuals: true,
          },
          options.toObject,
        ),
      }),
      (value, key: keyof mongoose.SchemaOptions) => {
        (mongooseOptions.mongooseSchema as mongoose.Schema).set(key, value);
      },
    );

    if (!this.options.multiTenancy?.enabled) {
      return this.registerModel(
        mongooseOptions,
        options.collection,
        this.mongoose,
      );
    }

    const tenantMap = this.createTenantMap(mongooseOptions.name);

    for (const tenancy of this.tenants) {
      let mi = this.getMongooseInstance(tenancy);

      tenantMap[tenancy] = this.registerModel(
        mongooseOptions,
        options.collection,
        mi,
        tenancy,
      );
    }

    return this.createProxy(tenantMap);
  }

  get tenants(): string[] {
    return _.union(['default'], this.options.multiTenancy.tenants);
  }

  createProxy(tenantMap: TenantMap): any {
    const tenants = this.tenants;

    const proxy: any = new Proxy({} as any, {
      get: (_obj: {}, prop: string) => {
        if (prop === '$tenantMap') {
          return tenantMap;
        }

        if (lazyFns.indexOf(prop) >= 0) {
          const ret = function () {
            const t = this.options.multiTenancy.tenancyFn(prop);
            const m1: any = tenantMap[t];
            const actualFn = m1[prop];

            return actualFn.apply(this, arguments);
          };
          return ret;
        }

        if (shareFns.indexOf(prop) >= 0) {
          const ret = (...args: any[]) => {
            return _.map(tenants, (t) => {
              const m2: any = tenantMap[t];
              return m2[prop].apply(m2, args);
            });
          };
          return ret;
        }

        const tenancy = this.options.multiTenancy.tenancyFn(prop);
        const m: any = tenantMap[tenancy];
        m._proxy = proxy;

        if (prop === '$modelClass') {
          return m;
        }

        const res = m[prop];
        return _.isFunction(res) ? res.bind(m) : res;
      },
      set: (_obj: {}, prop: string, value: any) => {
        const tenancy = this.options.multiTenancy.tenancyFn(prop);
        const m: any = tenantMap[tenancy];
        m[prop] = value;
        return true;
      },
    });

    return proxy;
  }

  private registerModel(
    mongooseOptions: MongooseOptions,
    collection: string,
    mInstance: mongoose.Mongoose,
    tenancy?: string,
  ): any {
    collection =
      collection ?? mongoose.pluralize()(mongooseOptions.name.toLowerCase());

    if (tenancy === 'default') {
      tenancy = this.options.multiTenancy.defaultCollectionNamespace || tenancy;
    }

    const model = mInstance.model(
      mongooseOptions.name,
      mongooseOptions.mongooseSchema as mongoose.Schema,
      tenancy == null ? collection : `${tenancy}.${collection}`,
    ) as any;

    model.on('index', (err: any) => {
      if (err) {
        throw new Error(
          `${mongooseOptions.name} index error: ${err}` +
            (tenancy != null ? `, tenancy: ${tenancy}` : ''),
        );
      }
    });

    model.mongooseManager = this;

    return model;
  }

  getMongooseOptions(model: string | ModelClass<any>): MongooseOptions {
    const name = _.isString(model) ? model : model.name;
    const key = name.toLowerCase();

    if (this.mongooseOptionsMap.has(key)) {
      return this.mongooseOptionsMap.get(key);
    }

    const metadata = A7Model.getMetadata(model);

    const mongooseOptions = new MongooseOptions(
      name,
      metadata,
    ).createMongooseSchema();

    this.mongooseOptionsMap.set(key, mongooseOptions);

    try {
      return mongooseOptions.updateMetadata(metadata, this);
    } catch (error) {
      if (error instanceof MetadataError) {
        throw new MetadataError(`${name}:${error.key}`);
      } else {
        throw error;
      }
    }
  }

  mapPropertyType(type: runtime.Type): MongooseType {
    switch (type) {
      case 'boolean':
        return { type: Boolean };

      case 'string':
        return { type: String };

      case 'number':
        return { type: Number };

      case 'any':
        return { type: mongoose.SchemaTypes.Mixed };

      case 'ID':
        return { type: mongoose.SchemaTypes.ObjectId };
    }

    if (type == null) {
      return { type: mongoose.SchemaTypes.Mixed };
    }

    if (runtime.isReferenceType(type)) {
      switch (type.referenceName) {
        case 'Date':
          return { type: Date };

        case 'Email':
          return { type: Email, trim: true };

        case 'UUID':
          return { type: UUID, trim: true };

        case 'SSN':
          return { type: SSN, trim: true };

        case 'PhoneNumber':
          return { type: PhoneNumber, trim: true };

        default:
          const referenceMongooseOptions = this.getMongooseOptions(
            type.referenceName,
          );

          return referenceMongooseOptions.mongooseSchema instanceof
            mongoose.Schema
            ? { type: referenceMongooseOptions.mongooseSchema }
            : _.clone(referenceMongooseOptions.mongooseSchema);
      }
    }

    if (runtime.isArrayType(type)) {
      const mType = this.mapPropertyType(type.arrayElementType);

      return {
        type: [mType],
        default: [],
      };
    }

    if (runtime.isParameterizedType(type)) {
      const mType = this.mapPropertyType(type.typeArgumentType);

      switch (type.selfType) {
        case 'Ref':
          if (runtime.isReferenceType(type.typeArgumentType)) {
            return {
              type: 'ObjectId',
              ref: type.typeArgumentType.referenceName,
            };
          }

        case 'MMap':
          const subType = this.mapPropertyType(type.typeArgumentType);
          if (subType == null) {
            throw new Error(`Unable to locate type ${type}`);
          }
          return {
            type: Map,
            of: subType.type,
          };
      }

      return mType;
    }
  }
}

export namespace mongooseManager {
  export type registerModel<
    T1,
    T2 = {},
    T3 = {},
    T4 = {},
    T5 = {},
    T6 = {},
    T7 = {},
    T8 = {},
    T9 = {}
  > = T1 & T2 & T3 & T4 & T5 & T6 & T7 & T8 & T9 & Partial<mongoose.Document>;
}

export const mongooseManager = new MongooseManager();

export interface MongooseManagerOptionsMultiTenancy {
  enabled: boolean;
  defaultCollectionNamespace?: string;
  tenants: string[];
  tenancyFn?: (prop: string) => string;
  uris?: string;
  options?: mongoose.ConnectionOptions;
  onError?: (err: any, tenancy: string) => void;
  onMongooseInstanceCreated?: (
    mongoose: mongoose.Mongoose,
    tenancy: string,
  ) => void;
}

export interface MongooseManagerOptions {
  mongoose?: mongoose.Mongoose;
  multiTenancy?: MongooseManagerOptionsMultiTenancy;
}

export interface MongooseType {
  type: any;
  default?: any;
  trim?: boolean;
  of?: any;
  ref?: any;
  enum?: (number | string)[];
}

/**
 * Mongoose options for current model.
 */
export class MongooseOptions {
  config: mongoose.SchemaOptions = {};
  schema: {
    [key: string]: any;
  } = {};
  mongooseSchema?: mongoose.Schema | MongooseType;
  pres: Pre[] = [];
  posts: Post[] = [];
  virtuals: Virtual[] = [];
  methods: Method[] = [];
  statics: Method[] = [];
  plugins: Plugin[] = [];
  indexes: MongooseIndex[] = [];
  updateValidators: UpdateValidator[] = [];

  constructor(public name: string, public metadata: Ark7ModelMetadata) {}

  methodNames(): string[] {
    return _.map(this.methods, (m) => m.name);
  }

  fieldNames(): string[] {
    return _.keys(this.schema);
  }

  clone(): MongooseOptions {
    const ret = new MongooseOptions(this.name, this.metadata);
    ret.config = this.config;
    ret.schema = this.schema;
    ret.mongooseSchema = this.mongooseSchema;
    ret.pres = this.pres;
    ret.posts = this.posts;
    ret.virtuals = this.virtuals;
    ret.methods = this.methods;
    ret.statics = this.statics;
    ret.plugins = this.plugins;
    ret.indexes = this.indexes;
    ret.updateValidators = this.updateValidators;

    return ret;
  }

  createMongooseSchema(mongooseSchema?: mongoose.Schema): this {
    this.mongooseSchema =
      this.mongooseSchema ??
      mongooseSchema ??
      (this.metadata.isEnum
        ? {
            type: this.metadata.enumType === 'string' ? String : Number,
            enum: this.metadata.enumValues,
          }
        : new mongoose.Schema());

    return this;
  }

  updateMetadata(metadata: Ark7ModelMetadata, manager: MongooseManager): this {
    const currentOptions = MongooseOptions.createFromCurrentMetadata(
      metadata,
      manager,
    );

    this.updateMongooseOptions(currentOptions);

    return this.updateMongooseSchema(metadata);
  }

  protected updateMongooseOptions(options: MongooseOptions): this {
    _.defaults(this.config, options.config);
    _.defaults(this.schema, options.schema);
    this.pres = _.union([...this.pres, ...options.pres]);
    this.posts = _.union([...this.posts, ...options.posts]);
    this.virtuals = _.union([...this.virtuals, ...options.virtuals]);
    this.methods = _.union([...this.methods, ...options.methods]);
    this.statics = _.union([...this.statics, ...options.statics]);
    this.plugins = _.union([...this.plugins, ...options.plugins]);
    this.indexes = _.union([...this.indexes, ...options.indexes]);
    this.updateValidators = _.union([
      ...this.updateValidators,
      ...options.updateValidators,
    ]);

    return this;
  }

  protected updateMongooseSchema(metadata: Ark7ModelMetadata): this {
    if (!(this.mongooseSchema instanceof mongoose.Schema)) {
      return this;
    }

    if (metadata.configs.discriminatorKey != null) {
      this.mongooseSchema.set(
        'discriminatorKey',
        metadata.configs.discriminatorKey,
      );
    }

    if (!(metadata.modelClass.prototype instanceof Model)) {
      this.mongooseSchema.set('_id', false);
    }
    this.mongooseSchema.set('id', false);

    try {
      this.mongooseSchema.add(this.schema);
    } catch (error) {
      console.error(
        'Invalid schema to add to',
        this.name,
        ', schema: ',
        this.schema,
      );
      throw error;
    }

    for (const virtual of this.virtuals) {
      dVirtual(
        'create virtual for %O with name %O and options %O',
        this.name,
        virtual.name,
        virtual.options,
      );
      let v = this.mongooseSchema.virtual(virtual.name, virtual.options);
      if (virtual.get) {
        v = v.get(virtual.get);
      }
      if (virtual.set) {
        v = v.set(virtual.set);
      }
    }

    for (const method of this.methods) {
      dMethod(
        'create method for %O with name %O and function %O',
        this.name,
        method.name,
        method.fn,
      );
      this.mongooseSchema.methods[method.name] = method.fn;
    }

    for (const method of this.statics) {
      dMethod(
        'create static function for %O with name %O and function %O',
        this.name,
        method.name,
        method.fn,
      );
      this.mongooseSchema.statics[method.name] = method.fn;
    }

    for (const index of this.indexes) {
      dIndex(
        'create index for %O with fields %O and options %O',
        this.name,
        index.fields,
        index.options,
      );
      this.mongooseSchema.index(index.fields, index.options);
    }

    return this;
  }

  protected static createFromCurrentMetadata(
    metadata: Ark7ModelMetadata,
    manager: MongooseManager,
  ): MongooseOptions {
    const options = new MongooseOptions(metadata.name, metadata);

    metadata.combinedFields.forEach((field) => {
      if (['_id', 'toObject', '$attach'].indexOf(field.name) >= 0) {
        return;
      }

      if (field.field == null && field.prop?.abstract) {
        return;
      }

      if (field.name === metadata.configs.discriminatorKey) {
        return;
      }

      if (field.isVirtualReference) {
        options.virtuals.push({
          name: field.name,
          options: _.pick(
            field.field,
            'ref',
            'localField',
            'foreignField',
            'justOne',
            'options',
            'count',
            'match',
          ),
        });
        return;
      }

      if (field.field?.noPersist) {
        return;
      }

      const target: any = _.defaults({}, field.field);
      const prop = field.prop;
      const descriptor = field.descriptor;

      if (
        field.field == null &&
        field.prop?.modifier !== runtime.Modifier.PUBLIC
      ) {
        return;
      }

      if (field.descriptor == null) {
        if (field.prop.modifier === runtime.Modifier.PUBLIC) {
          let type;

          try {
            type = manager.mapPropertyType(field.prop.type);
          } catch (error) {
            if (error instanceof MetadataError) {
              throw new MetadataError(`${field.name}.${error.key}`);
            } else {
              throw error;
            }
          }

          if (!field.prop.optional && type.default == null) {
            switch (type.type) {
              case Boolean:
                type.default = false;
                break;

              case String:
                type.default = '';
                break;

              case Number:
                type.default = 0;
                break;

              default:
                if (type.type instanceof mongoose.Schema) {
                  type.default = () => ({});
                }
                break;
            }
          }

          if (field.prop.optional && type.enum != null) {
            type.enum = _.union(type.enum, [null]);
          }

          _.defaults(
            target,
            options.schema[prop.name],
            _.extend(type, {
              required: !prop.optional,
            }),
          );
        }
      } else {
        if (descriptor.value && _.isFunction(descriptor.value)) {
          options.methods.push({ name: prop.name, fn: descriptor.value });
          return;
        }

        if (descriptor.get || descriptor.set) {
          const virtual: Virtual = {
            name: prop.name,
          };
          if (descriptor.get) {
            virtual.get = descriptor.get;
          }
          if (descriptor.set) {
            virtual.set = descriptor.set;
          }
          options.virtuals.push(virtual);
          return;
        }
      }

      options.schema[field.name] = target;
    });

    for (const cls of metadata.classes.reverse()) {
      _.each(Object.getOwnPropertyDescriptors(cls), (desc, key) => {
        if (['name', 'prototype', 'length', 'modelize'].indexOf(key) >= 0) {
          return;
        }

        if (_.find(options.statics, (s) => s.name === key) == null) {
          options.statics.push({
            name: key,
            fn: desc.value,
          });
        }
      });
    }

    options.indexes = metadata.configs.indexes || [];

    dSchema('create schema for %O with %O', metadata.name, options.schema);

    return options;
  }
}

export interface Pre {
  name: string;
  fn: (next: (err?: NativeError) => void) => void;
  parallel?: boolean;
  errorCb?: (err: Error) => void;
}

export interface PPre {
  fn: (next: (err?: NativeError) => void) => void;
  parallel?: boolean;
  errorCb?: (err: Error) => void;
}

export interface Post {
  name: string;
  fn: PostFn1 | PostFn2;
}

export interface PPost {
  fn: PostFn1 | PostFn2;
}

export type PostFn1 = (doc: object, next: (err?: NativeError) => void) => void;
export type PostFn2 = (
  error: MongoError,
  doc: object,
  next: (err?: NativeError) => void,
) => void;

export interface Virtual {
  name: string;
  get?: () => any;
  set?: (val?: any) => void;
  options?: VirtualOptions;
}

export interface Method {
  name: string;
  fn: () => void;
}

export interface Plugin {
  fn: (schema: mongoose.Schema, options?: object) => void;
  options?: object;
  priority?: number;
}

export interface MongooseIndex {
  fields: object;
  options?: {
    expires?: string;
    [other: string]: any;
  };
}

export interface Validator {
  validator: (v: any) => any;
  message: string | ((props: { value: any }) => string);
}

export interface UpdateValidator {
  path: string;
  fn: (val?: any) => boolean;
  errorMsg?: string;
  type?: string;
}

export interface VirtualOptions {
  ref: string;
  localField: string;
  foreignField: string;
  justOne?: boolean;
  options?: any;
  count?: boolean;
  match?: object;
}

export class NativeError extends global.Error {}

export const lazyFns: string[] = [];

export const shareFns = ['on'];
