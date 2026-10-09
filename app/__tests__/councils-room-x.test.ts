// «المجالس» X Spaces room: every participant in equal circles with role tags, a
// virtualized + paged grid, the 12-seat stage and «عرض صورة» (Gold).
import { readFileSync } from 'fs';
import path from 'path';
import {
  COUNCIL_LISTENERS_PAGE,
  COUNCIL_MAX_SPEAKERS,
  COUNCIL_SHOW_IMAGE_LABEL,
  CouncilApiError,
  councilErrorMessage,
  councilParticipantTag,
  councilParticipants,
  mergeCouncilListeners,
  type CouncilListener,
  type CouncilSpeaker,
  type CouncilUser,
} from '@/services/councils';
import { REPORT_TARGET_LABEL_AR } from '@/lib/myReports';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const user = (id: string): CouncilUser => ({
  id,
  username: id,
  displayName: id,
  arabicName: '',
  avatar: null,
  verified: false,
});
const speaker = (id: string, seatIndex: number, role: CouncilSpeaker['role'] = 'SPEAKER'): CouncilSpeaker => ({
  userId: id,
  seatIndex,
  role,
  micMuted: false,
  mutedByModerator: false,
  online: true,
  agoraUid: seatIndex + 1,
  user: user(id),
});
const listener = (id: string, role: CouncilListener['role'] = 'LISTENER'): CouncilListener => ({
  userId: id,
  role,
  user: user(id),
});

describe('participants grid helpers', () => {
  it('orders owner, moderators, speakers, then listeners; nobody twice, no cap', () => {
    const speakers = [speaker('s2', 3), speaker('owner', 0, 'OWNER'), speaker('modOn', 5, 'MODERATOR'), speaker('s1', 1)];
    const listeners = [listener('modOff', 'MODERATOR'), ...Array.from({ length: 100 }, (_, i) => listener(`l${i}`)), listener('s1')];
    const out = councilParticipants(speakers, listeners);
    expect(out.slice(0, 5).map((p) => p.userId)).toEqual(['owner', 'modOn', 'modOff', 's1', 's2']);
    expect(out).toHaveLength(105);
    expect(new Set(out.map((p) => p.userId)).size).toBe(105);
    expect(out.find((p) => p.userId === 's1')?.onStage).toBe(true); // stage wins over a stale listener row
    expect(out[out.length - 1].userId).toBe('l99');
  });

  it('role tags: «راعي المجلس» / «مشرف» / «متحدث», none for listeners', () => {
    expect(councilParticipantTag({ role: 'OWNER', onStage: true })).toBe('راعي المجلس');
    expect(councilParticipantTag({ role: 'MODERATOR', onStage: false })).toBe('مشرف');
    expect(councilParticipantTag({ role: 'SPEAKER', onStage: true })).toBe('متحدث');
    expect(councilParticipantTag({ role: 'LISTENER', onStage: false })).toBeNull();
  });

  it('a fresh first page keeps listener pages already scrolled to', () => {
    const loaded = Array.from({ length: COUNCIL_LISTENERS_PAGE + 5 }, (_, i) => listener(`l${i}`));
    const fresh = [listener('new'), ...loaded.slice(0, COUNCIL_LISTENERS_PAGE - 1)];
    const merged = mergeCouncilListeners(loaded, fresh, COUNCIL_LISTENERS_PAGE);
    expect(merged[0].userId).toBe('new');
    expect(merged).toHaveLength(COUNCIL_LISTENERS_PAGE + 5);
    expect(new Set(merged.map((l) => l.userId)).size).toBe(merged.length);
    // Only one page loaded: the fresh page replaces it.
    expect(mergeCouncilListeners(loaded.slice(0, 3), [listener('x')], COUNCIL_LISTENERS_PAGE)).toHaveLength(1);
  });

  it('keeps the 12-seat stage and maps the Gold-only image error', () => {
    expect(COUNCIL_MAX_SPEAKERS).toBe(12);
    expect(councilErrorMessage(new CouncilApiError('x', 403, 'council_image_gold_only'))).toContain('Gold');
  });
});

describe('room screen wiring', () => {
  const room = src('app/councils/[id].tsx');
  const list = src('components/councils/CouncilParticipantsList.tsx');
  const seat = src('components/councils/SpeakerSeat.tsx');
  const card = src('components/councils/CouncilImageCard.tsx');
  const picker = src('components/councils/CouncilImagePickerSheet.tsx');
  const provider = src('contexts/CouncilSessionContext.tsx');
  const socket = src('hooks/useCouncilSocket.ts');

  it('virtualized 4-column grid that pages listeners from the server', () => {
    expect(list).toContain('<FlatList');
    expect(list).toContain('numColumns={COUNCIL_GRID_COLUMNS}');
    expect(list).toContain('onEndReached={onEndReached}');
    expect(room).toContain('onEndReached={() => void session.loadMoreListeners()}');
    expect(provider).toContain('fetchCouncilListeners(id, cursor)');
    expect(socket).toContain("'council:image'");
  });

  it('equal circles: one avatar size, role tag under the name, mic badge only on stage', () => {
    expect(seat).toContain('const AVATAR = 64;');
    expect(seat).toContain('const tag = councilParticipantTag(speaker);');
    expect(seat).toContain('const muted = speaker.onStage && (speaker.micMuted || speaker.mutedByModerator);');
    expect(seat).toContain('testID="council-hand-raised"');
  });

  it('«عرض صورة»: Gold action, fullscreen viewer, «عرض الإعلان», report; never about auctions', () => {
    expect(COUNCIL_SHOW_IMAGE_LABEL).toBe('عرض صورة');
    expect(room).toContain('me.canShowImage');
    expect(room).toContain("promptReport('council_image', id, true)");
    expect(card).toContain('<ImageViewerModal');
    expect(card).toContain('عرض الإعلان');
    expect(picker).toContain('fetchCouncilImageSources()');
    expect(picker).toContain("uploadImageFromUri(token, result.assets[0].uri, 'posts')");
    expect(REPORT_TARGET_LABEL_AR.council_image).toBe('صورة في مجلس');
    for (const code of [room, card, picker, src('services/councils.ts')]) {
      expect(code).not.toMatch(/مزاد|auction/i);
    }
  });
});
