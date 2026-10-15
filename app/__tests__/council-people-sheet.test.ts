import { filterCouncilPeople } from '@/lib/councilPeople';

const p = (userId: string, role: string, onStage: boolean) =>
  ({ userId, role, onStage, micMuted: false, mutedByModerator: false, online: true, user: { id: userId } }) as never;

describe('council people sheet tabs', () => {
  const people = [p('o', 'OWNER', true), p('m', 'MODERATOR', true), p('s', 'SPEAKER', true), p('l', 'LISTENER', false)];
  it('groups everyone by host / speakers / listeners', () => {
    expect(filterCouncilPeople(people, 'all')).toHaveLength(4);
    expect(filterCouncilPeople(people, 'host').map((x: { userId: string }) => x.userId)).toEqual(['o', 'm']);
    expect(filterCouncilPeople(people, 'speakers').map((x: { userId: string }) => x.userId)).toEqual(['s']);
    expect(filterCouncilPeople(people, 'listeners').map((x: { userId: string }) => x.userId)).toEqual(['l']);
  });
});
