export interface NativeLocationMapProps {
  lat: number;
  lng: number;
  cityLabel?: string;
  height: number;
  interactive?: boolean;
  onPick?: (lat: number, lng: number) => void;
}

export function NativeLocationMap(props: NativeLocationMapProps): React.ReactNode;
