import 'should';

import _ from 'underscore';
import {
  A7Model,
  Basic,
  CompoundIndex,
  Confidential,
  Default,
  DefaultDataLevel,
  Detail,
  Model,
  Readonly,
  Ref,
  Short,
} from '@ark7/model';

import { aggregator } from '../../src/mixins/koa';
import { mongooseManager } from '../../src';

namespace models {
  @A7Model({})
  export class KOA1 extends Model {
    @Basic() foo: string;
    @Short()
    @Default('bar')
    foo2?: string;
  }

  @A7Model({})
  @CompoundIndex({ foo2: 'text' }, { name: 'text-search' })
  export class KOA extends Model {
    @Basic() foo: string;

    @Short()
    @Readonly()
    foo2?: string;

    @Default(1)
    @Confidential()
    s3?: number;

    @Detail() e1?: KOA1;

    @Short() e2?: Ref<KOA1>;

    @Short() e3?: Ref<KOA1>[];
  }

  export enum KOADisType {
    KOADis1 = 'KOADis1',
  }
  A7Model.provide(KOADisType);

  @A7Model({
    discriminatorKey: 'type',
  })
  export class KOADis extends Model {
    type: KOADisType;
  }

  @A7Model({})
  export class KOADis1 extends KOADis {
    value: string;
  }
}

const KOA = mongooseManager.register(models.KOA);
type KOA = models.KOA;
const KOA1 = mongooseManager.register(models.KOA1);
type KOA1 = models.KOA1;

const KOADis = mongooseManager.register(models.KOADis);
type KOADis = models.KOADis;

const KOADis1 = mongooseManager.discriminator(KOADis, models.KOADis1);
type KOADis1 = models.KOADis1;

describe('koa', () => {
  describe('#createMiddleware', () => {
    beforeEach(() => {
      KOA.db;
      KOA1.db;
    });

    it('should be rejected with missing parameters', async () => {
      const m = KOA.createMiddleware({});

      const ctx: any = {
        request: {
          body: {},
        },
      };
      await m(ctx, null).should.rejectedWith(
        'KOA validation failed: foo: Path `foo` is required.',
      );
    });

    it('should create object successfully', async () => {
      const m = KOA.createMiddleware({});

      const ctx: any = {
        request: {
          body: {
            foo: 'bar',
          },
        },
      };
      await m(ctx, null);
      _.omit(ctx.body, '_id').should.be.deepEqual({
        foo: 'bar',
        e3: [],
      });
    });
  });

  describe('#getMiddleware', () => {
    let e: KOA1;
    let d: KOA;

    beforeEach(async () => {
      e = await KOA1.create({ foo: 'bar' });
      d = await KOA.create({ foo: 'bar', foo2: 'bar2', e1: e, e2: e, e3: [e] });
    });

    it('should reads data successfully', async () => {
      const m = KOA.getMiddleware({ field: 'id' });
      const ctx: any = {
        request: {},
        params: {
          id: d._id.toString(),
        },
      };
      await m(ctx, null);
      ctx.body.should.be.deepEqual({
        _id: d._id.toString(),
        foo: 'bar',
        foo2: 'bar2',
        e2: e.toJSON(),
        e1: e.toJSON(),
        e3: [e.toJSON()],
      });
    });

    it('should returns basic data', async () => {
      const m = KOA.getMiddleware({
        field: 'id',
        level: DefaultDataLevel.BASIC,
      });
      const ctx: any = {
        request: {},
        params: {
          id: d._id.toString(),
        },
      };
      await m(ctx, null);
      ctx.body.should.be.deepEqual({ _id: d._id.toString(), foo: 'bar' });
    });
  });

  describe('#findMiddleware', () => {
    let e: KOA1;
    let d1: KOA;
    let d2: KOA;

    beforeEach(async () => {
      await KOA.deleteMany({});
      e = await KOA1.create({ foo: 'bar' });
      d1 = await KOA.create({
        foo: 'bar',
        foo2: 'bar2',
        e1: e,
        e2: e,
        e3: [e],
        s3: 6,
      });
      d2 = await KOA.create({
        foo: 'bar',
        foo2: 'test bar2',
        e1: e,
        e2: e,
        e3: [e],
        s3: 4,
      });
    });

    it('should find data successfully', async () => {
      const m = KOA.findMiddleware({});
      const ctx: any = {
        request: {},
        params: {},
      };
      await m(ctx, null);
      ctx.body.should.be.deepEqual([
        d1.toJSON({ level: DefaultDataLevel.SHORT }),
        d2.toJSON({ level: DefaultDataLevel.SHORT }),
      ]);
    });

    it('should find pagination data successfully', async () => {
      const m = KOA.findMiddleware({
        pagination: {
          agg: {
            total: aggregator.sum('s3'),
            before: aggregator.sumBefore('s3'),
            after: aggregator.sumAfter('s3'),
            current: aggregator.sumCurrent('s3'),
            currentAndBefore: aggregator.sumCurrentAndBefore('s3'),
            currentAndAfter: aggregator.sumCurrentAndAfter('s3'),
          },
          size: 1,
        },
      });
      const ctx: any = {
        request: {},
        params: {},
      };
      await m(ctx, null);
      ctx.body.should.be.deepEqual({
        pageSize: 1,
        page: 0,
        total: 2,
        data: [d1.toJSON({ level: DefaultDataLevel.SHORT })],
        agg: {
          total: 10,
          before: 0,
          after: 4,
          current: 6,
          currentAndBefore: 6,
          currentAndAfter: 10,
        },
      });
    });

    it('should find data with search successfully', async () => {
      const m = KOA.findMiddleware({});
      const ctx: any = {
        request: {},
        params: {},
        overrides: {
          query: {
            $text: {
              $search: 'test bar2',
            },
          },
          sort: {
            score: {
              $meta: 'textScore',
            },
          },
        },
      };
      await m(ctx, null);

      // d2 should be ranked before d1 for relevance
      ctx.body.should.be.deepEqual([
        d2.toJSON({ level: DefaultDataLevel.SHORT }),
        d1.toJSON({ level: DefaultDataLevel.SHORT }),
      ]);
    });
  });

  describe('#updateMiddleware', () => {
    let e: KOA1;
    let d: KOA;
    let dis1: KOADis1;

    beforeEach(async () => {
      e = await KOA1.create({ foo: 'bar' });
      d = await KOA.create({ foo: 'bar', foo2: 'bar2', e1: e, e2: e, e3: [e] });

      dis1 = await KOADis1.create({
        type: models.KOADisType.KOADis1,
        value: 'value',
      });
    });

    it('should not update readonly data', async () => {
      const m = KOA.updateMiddleware({ field: 'id' });
      const ctx: any = {
        request: {
          body: {
            foo2: 'bar3',
            'e1.foo': 'bar2',
          },
        },
        params: {
          id: d._id.toString(),
        },
      };
      await m(ctx, null);
      ctx.body.should.be.deepEqual({
        _id: d._id.toString(),
        foo: 'bar',
        foo2: 'bar2',
        e2: e.toJSON(),
        e1: _.extend(e.toJSON(), { foo: 'bar2' }),
        e3: [e.toJSON()],
      });
    });

    it('should update discriminator fields', async () => {
      const m = KOADis.updateMiddleware({ field: 'id' });

      const ctx: any = {
        request: {
          body: {
            type: 'KOADis1',
            value: 'value2',
          },
        },
        params: {
          id: dis1._id.toString(),
        },
      };

      await m(ctx, null);

      ctx.body.should.be.deepEqual({
        _id: dis1._id.toString(),
        type: models.KOADisType.KOADis1,
        value: 'value2',
      });
    });
  });
});
