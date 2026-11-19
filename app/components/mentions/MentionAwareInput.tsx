import { forwardRef, useEffect, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { MentionSuggestList } from '@/components/mentions/MentionSuggestList';
import { activeMentionQuery, insertMention } from '@/lib/mentions';
import { suggestMentions, type MentionSuggestion } from '@/services/mentions';

type Props = TextInputProps & {
  value: string;
  onChangeText: (text: string) => void;
};

/**
 * Text field that opens an @mention list. The list is above the field so it
 * stays in the RTL composer without covering the caret.
 */
export const MentionAwareInput = forwardRef<TextInput, Props>(function MentionAwareInput(
  { value, onChangeText, onSelectionChange, ...rest },
  ref,
) {
  const [caret, setCaret] = useState(value.length);
  const [items, setItems] = useState<MentionSuggestion[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const active = activeMentionQuery(value, caret);
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

  const pick = (item: MentionSuggestion) => {
    if (!active) return;
    const next = insertMention(value, active.start, caret, item.username);
    onChangeText(next.text);
    setCaret(next.caret);
    setItems([]);
  };

  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <MentionSuggestList items={shown} onPick={pick} />
      <TextInput
        {...rest}
        ref={ref}
        value={value}
        onChangeText={(text) => {
          onChangeText(text);
          setCaret(text.length);
        }}
        onSelectionChange={(event) => {
          setCaret(event.nativeEvent.selection.start);
          onSelectionChange?.(event);
        }}
      />
    </View>
  );
});
