import { Clipboard } from 'react-native';

/** Copy plain text using the Clipboard already shipped with React Native. */
export function copyToClipboard(value: string): void {
  Clipboard.setString(value);
}
