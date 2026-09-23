export interface NativeLocationMapProps {
  lat: number;
  lng: number;
  cityLabel?: string;
  height: number;
  interactive?: boolean;
  onPick?: (lat: number, lng: number) => void;
}

/** Web stub — schematic map is used instead */
export function NativeLocationMap(_props: NativeLocationMapProps) {
  return null;
}
