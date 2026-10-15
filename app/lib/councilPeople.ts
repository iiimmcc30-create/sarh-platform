import type { CouncilParticipant } from '@/services/councils';

export type CouncilPeopleTab = 'all' | 'host' | 'speakers' | 'listeners';

export const COUNCIL_PEOPLE_TABS: { key: CouncilPeopleTab; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'host', label: 'المضيف' },
  { key: 'speakers', label: 'المتحدثون' },
  { key: 'listeners', label: 'المستمعون' },
];

/** Pure grouping (tested): host = owner + moderators, speakers = others on stage. */
export function filterCouncilPeople(
  people: readonly CouncilParticipant[],
  tab: CouncilPeopleTab,
): CouncilParticipant[] {
  const isHost = (p: CouncilParticipant) => p.role === 'OWNER' || p.role === 'MODERATOR';
  switch (tab) {
    case 'host':
      return people.filter(isHost);
    case 'speakers':
      return people.filter((p) => p.onStage && !isHost(p));
    case 'listeners':
      return people.filter((p) => !p.onStage && !isHost(p));
    default:
      return [...people];
  }
}

