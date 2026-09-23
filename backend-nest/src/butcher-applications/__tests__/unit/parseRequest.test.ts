import {
  parseApplicationId,
  parseDocumentId,
  parseIfUnmodifiedSince,
} from '../../routes/parseRequest';
import { createMockReq, TEST_APP_ID } from '../helpers/testUtils';

describe('parseRequest', () => {
  it('parseApplicationId accepts valid uuid', () => {
    expect(parseApplicationId({ id: TEST_APP_ID })).toBe(TEST_APP_ID);
  });

  it('parseApplicationId rejects invalid uuid', () => {
    expect(parseApplicationId({ id: 'not-uuid' })).toBeNull();
  });

  it('parseDocumentId accepts valid uuid', () => {
    expect(parseDocumentId({ documentId: TEST_APP_ID })).toBe(TEST_APP_ID);
  });

  it('parseIfUnmodifiedSince returns undefined when absent', () => {
    expect(parseIfUnmodifiedSince({})).toBeUndefined();
  });

  it('parseIfUnmodifiedSince returns null on invalid date', () => {
    expect(parseIfUnmodifiedSince({ 'if-unmodified-since': 'invalid' })).toBeNull();
  });

  it('parseIfUnmodifiedSince parses ISO date', () => {
    expect(
      parseIfUnmodifiedSince({ 'if-unmodified-since': '2025-01-15T10:00:00.000Z' })?.toISOString(),
    ).toBe('2025-01-15T10:00:00.000Z');
  });
});
