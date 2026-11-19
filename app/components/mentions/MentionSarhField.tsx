import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SarhInput, type SarhInputProps } from '@/design-system/components';
import { MentionSuggestList } from '@/components/mentions/MentionSuggestList';
import { activeMentionQuery, insertMention } from '@/lib/mentions';
import { suggestMentions, type MentionSuggestion } from '@/services/mentions';

/** SarhInput plus the @mention list. Used for listing captions. */
export function MentionSarhField({ value, onChangeText, onSelectionChange, ...rest }: SarhInputProps) {
  const text = typeof value === 'string' ? value : '';
  const [caret, setCaret] = useState(text.length);
  const [items, setItems] = useState<MentionSuggestion[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const active = activeMentionQuery(text, caret);
  const query = active?.query;
  const shown = query !== undefined && loadedFor === query ? items : [];

  useEffect(() => {
    if (query === undefined) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void suggestMentions(query)
        .then((rows) => {
          if (cancelled) return;
          setItems(rows);
          setLoadedFor(query);
        })
        .catch(() => {
          if (cancelled) return;
          setItems([]);
          setLoadedFor(query);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <View>
      <MentionSuggestList
        items={shown}
        onPick={(item) => {
          if (!active) return;
          const next = insertMention(text, active.start, caret, item.username);
          onChangeText?.(next.text);
          setCaret(next.caret);
          setItems([]);
        }}
      />
      <SarhInput
        {...rest}
        value={text}
        onChangeText={(next) => {
          onChangeText?.(next);
          setCaret(next.length);
        }}
        onSelectionChange={(event) => {
          setCaret(event.nativeEvent.selection.start);
          onSelectionChange?.(event);
        }}
      />
    </View>
  );
}
