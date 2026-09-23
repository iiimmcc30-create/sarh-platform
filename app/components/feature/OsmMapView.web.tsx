import { osmEmbedUrl } from '@/lib/osmMap';

type Props = {
  lat: number;
  lng: number;
  height: number;
};

/** Web — interactive OpenStreetMap embed */
export function OsmMapView({ lat, lng, height }: Props) {
  return (
    <iframe
      title="خريطة الموقع"
      src={osmEmbedUrl(lat, lng)}
      width="100%"
      height={height}
      style={{ border: 0, display: 'block', borderRadius: 12 }}
      loading="lazy"
    />
  );
}
