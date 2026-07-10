import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { getDataset } from './report-datasets';
import {
  buildGroupId,
  buildMatch,
  buildMetrics,
  buildSort,
  combineConditions,
  compileFilter,
} from './report-query.util';

const opportunities = getDataset('opportunities')!;

describe('report-query.util', () => {
  describe('compileFilter', () => {
    it('compiles an equality filter on an enum field', () => {
      expect(
        compileFilter(opportunities, {
          field: 'stage',
          operator: 'eq',
          value: 'closed_lost',
        }),
      ).toEqual({ stage: 'closed_lost' });
    });

    it('compiles a numeric comparison', () => {
      expect(
        compileFilter(opportunities, {
          field: 'amount',
          operator: 'gt',
          value: '10000',
        }),
      ).toEqual({ amount: { $gt: 10000 } });
    });

    it('compiles a between range', () => {
      expect(
        compileFilter(opportunities, {
          field: 'amount',
          operator: 'between',
          value: [1000, 5000],
        }),
      ).toEqual({ amount: { $gte: 1000, $lte: 5000 } });
    });

    it('compiles contains to a case-insensitive regex', () => {
      const out = compileFilter(opportunities, {
        field: 'name',
        operator: 'contains',
        value: 'acme',
      });
      expect(out.name).toBeInstanceOf(RegExp);
      expect((out.name as RegExp).test('ACME Corp')).toBe(true);
    });

    it('casts ObjectId fields', () => {
      const id = new Types.ObjectId().toString();
      const out = compileFilter(opportunities, {
        field: 'assignedTeamId',
        operator: 'eq',
        value: id,
      });
      expect((out.assignedTeamId as Types.ObjectId).toString()).toBe(id);
    });

    it('rejects an unknown field', () => {
      expect(() =>
        compileFilter(opportunities, {
          field: 'nope',
          operator: 'eq',
          value: 'x',
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects an operator not allowed for the field type', () => {
      expect(() =>
        compileFilter(opportunities, {
          field: 'stage',
          operator: 'gt',
          value: 'discovery',
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects an invalid enum value', () => {
      expect(() =>
        compileFilter(opportunities, {
          field: 'stage',
          operator: 'eq',
          value: 'imaginary',
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects a non-numeric value on a number field', () => {
      expect(() =>
        compileFilter(opportunities, {
          field: 'amount',
          operator: 'gt',
          value: 'abc',
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('combineConditions', () => {
    it('returns {} for no conditions', () => {
      expect(combineConditions([null, {}, undefined])).toEqual({});
    });

    it('returns the single condition unwrapped', () => {
      expect(combineConditions([{ a: 1 }])).toEqual({ a: 1 });
    });

    it('wraps multiple conditions in $and', () => {
      expect(combineConditions([{ a: 1 }, { b: 2 }])).toEqual({
        $and: [{ a: 1 }, { b: 2 }],
      });
    });
  });

  describe('buildMatch', () => {
    it('merges filters, date range and visibility', () => {
      const match = buildMatch(
        opportunities,
        [{ field: 'stage', operator: 'eq', value: 'closed_lost' }],
        { field: 'closedAt', from: '2024-07-01', to: '2024-09-30' },
        { assignedToId: 'user-1' },
      );
      expect(match.$and).toHaveLength(3);
    });
  });

  describe('buildGroupId', () => {
    it('groups a scalar field by its path', () => {
      expect(buildGroupId(opportunities, 'stage')).toBe('$stage');
    });

    it('truncates a date field by granularity', () => {
      expect(buildGroupId(opportunities, 'createdAt', 'month')).toEqual({
        $dateTrunc: { date: '$createdAt', unit: 'month' },
      });
    });

    it('rejects a non-groupable field', () => {
      expect(() => buildGroupId(opportunities, 'lostReason')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('buildMetrics', () => {
    it('builds count and sum accumulators', () => {
      const { accumulators, aliases } = buildMetrics(opportunities, [
        { fn: 'count' },
        { fn: 'sum', field: 'amount', alias: 'pipeline' },
      ]);
      expect(accumulators).toEqual({
        count: { $sum: 1 },
        pipeline: { $sum: '$amount' },
      });
      expect(aliases).toEqual(['count', 'pipeline']);
    });

    it('rejects aggregating a non-numeric field', () => {
      expect(() =>
        buildMetrics(opportunities, [{ fn: 'sum', field: 'stage' }]),
      ).toThrow(BadRequestException);
    });

    it('rejects sum without a field', () => {
      expect(() => buildMetrics(opportunities, [{ fn: 'sum' }])).toThrow(
        BadRequestException,
      );
    });
  });

  describe('buildSort', () => {
    it('defaults to the dataset date field, descending', () => {
      expect(buildSort(opportunities, undefined, undefined)).toEqual({
        createdAt: -1,
        _id: -1,
      });
    });

    it('rejects sorting by a non-sortable field', () => {
      expect(() => buildSort(opportunities, 'lostReason', 'asc')).toThrow(
        BadRequestException,
      );
    });
  });
});
