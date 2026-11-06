import { useVideoPlayer, VideoView } from 'expo-video';
import { type StyleProp, type ViewStyle } from 'react-native';

/** A video that plays on a loop with no controls: the Result screen and previews. */
export function VideoLoop({
  uri,
  muted = false,
  style,
}: {
  uri: string;
  muted?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = muted;
    p.play();
  });
  return <VideoView player={player} style={style} nativeControls={false} contentFit="contain" />;
}
