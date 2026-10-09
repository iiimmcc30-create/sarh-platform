import { Platform, Share } from 'react-native';

type LegacyFs = {
  cacheDirectory: string | null;
  writeAsStringAsync: (uri: string, contents: string) => Promise<void>;
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: () => Promise<{ granted: boolean; directoryUri?: string }>;
    createFileAsync: (dirUri: string, name: string, mime: string) => Promise<string>;
  };
};

/** `sarh-data-2026-10-09.json` */
export function exportFileName(now = new Date()): string {
  return `sarh-data-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Save a JSON document where the user chooses, without new libraries:
 * web → browser download; Android → folder picker (Storage Access Framework);
 * iOS → share sheet with the file (Save to Files, AirDrop, mail…).
 * Returns false when the user cancelled.
 */
export async function saveJsonFile(fileName: string, data: unknown): Promise<boolean> {
  const text = JSON.stringify(data, null, 2);
  if (Platform.OS === 'web') {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
  const fs = require('expo-file-system/legacy') as LegacyFs;
  if (Platform.OS === 'android') {
    const perm = await fs.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!perm.granted || !perm.directoryUri) return false;
    const uri = await fs.StorageAccessFramework.createFileAsync(perm.directoryUri, fileName, 'application/json');
    await fs.writeAsStringAsync(uri, text);
    return true;
  }
  const uri = `${fs.cacheDirectory ?? ''}${fileName}`;
  await fs.writeAsStringAsync(uri, text);
  const res = await Share.share({ url: uri, title: fileName });
  return res.action !== Share.dismissedAction;
}
