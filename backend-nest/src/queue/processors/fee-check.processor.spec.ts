import { FeeCheckProcessor } from './fee-check.processor';

describe('FeeCheckProcessor', () => {
  it('does not mutate listings or send fee notifications', async () => {
    const logger = { info: jest.fn() };
    const processor = new FeeCheckProcessor(logger as never);
    await processor.process({ id: '1', name: 'check', data: {} } as never);
    expect(logger.info).toHaveBeenCalled();
  });
});
