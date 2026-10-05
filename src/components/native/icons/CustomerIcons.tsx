import Svg, { Circle, Path, Rect } from 'react-native-svg';

type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

const cap = 'round' as const;
const join = 'round' as const;

export function IconBell({ size = 20, color = '#11766F', strokeWidth = 1.75 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap={cap}
        strokeLinejoin={join}
      />
      <Path
        d="M10.3 20a1.8 1.8 0 0 0 3.4 0"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap={cap}
        strokeLinejoin={join}
      />
    </Svg>
  );
}

export function IconHeadset({ size = 20, color = '#11766F', strokeWidth = 1.75 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 12a8 8 0 0 1 16 0"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap={cap}
        strokeLinejoin={join}
      />
      <Path
        d="M4 12v2.5a2 2 0 0 0 2 2h1V12H4z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap={cap}
        strokeLinejoin={join}
      />
      <Path
        d="M20 12v2.5a2 2 0 0 1-2 2h-1V12h3z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap={cap}
        strokeLinejoin={join}
      />
      <Path
        d="M16 18.5v.5a3 3 0 0 1-3 3h-1"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap={cap}
        strokeLinejoin={join}
      />
    </Svg>
  );
}

export function IconHeadsetCompact({ size = 14, color = '#11766F', strokeWidth = 1.75 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 12a8 8 0 0 1 16 0"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap={cap}
        strokeLinejoin={join}
      />
      <Path
        d="M4 12v2.5a2 2 0 0 0 2 2h1V12H4z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap={cap}
        strokeLinejoin={join}
      />
      <Path
        d="M20 12v2.5a2 2 0 0 1-2 2h-1V12h3z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap={cap}
        strokeLinejoin={join}
      />
    </Svg>
  );
}

export function IconServiceHome({ size = 22, color = '#11766F', strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 11.5 12 4l9 7.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
      <Path d="M6 10.5V20h12V10.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
      <Path d="M10 20v-5h4v5" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
    </Svg>
  );
}

export function IconServiceStairs({ size = 18, color = '#11766F', strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 20h16" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
      <Path d="M4 20V15h4v-4h4V7h4V4" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
    </Svg>
  );
}

export function IconServiceWorker({ size = 18, color = '#11766F', strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={7} r={2.4} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M4.8 19.5v-1.8a4.2 4.2 0 0 1 8.4 0v1.8" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
      <Path d="M14.5 8.5h4.2l.6 2.2H16" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
      <Path d="M16.2 10.7V16" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} />
    </Svg>
  );
}

export function IconServicePaint({ size = 18, color = '#11766F', strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3.5} y={4} width={13} height={5.5} rx={1.6} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M14 9.5v2.2a2 2 0 0 1-2 2H10" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
      <Path d="M10 13.7V20" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} />
    </Svg>
  );
}

export function IconServiceSofa({ size = 22, color = '#11766F', strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 13v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
      <Path d="M4 13a2.5 2.5 0 0 1 2.5-2.5h11A2.5 2.5 0 0 1 20 13" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
      <Path d="M7 10.5V8a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v2.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
      <Path d="M7 18v2M17 18v2" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
    </Svg>
  );
}

export function IconServiceOffice({ size = 22, color = '#11766F', strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 20V9l8-5 8 5v11" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
      <Path d="M9 20v-6h6v6" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
      <Path d="M9 11h.01M15 11h.01M12 11h.01" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
    </Svg>
  );
}

export function IconStatusClock({ size = 12, color = '#D97706', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M12 8v4.5l3 1.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
    </Svg>
  );
}

export function IconClock({ size = 14, color = '#8A9290', strokeWidth = 1.75 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M12 8v4l2.5 1.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
    </Svg>
  );
}

export function IconPin({ size = 14, color = '#8A9290', strokeWidth = 1.75 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21s-7-5.2-7-10a7 7 0 0 1 14 0c0 4.8-7 10-7 10z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap={cap}
        strokeLinejoin={join}
      />
      <Circle cx={12} cy={11} r={2.2} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function IconChevronBack({ size = 18, color = '#8A9290', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M14.5 6 L9 12 L14.5 18" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
    </Svg>
  );
}

export function IconShield({ size = 14, color = '#11766F', strokeWidth = 1.75 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3l7 3v5.5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap={cap}
        strokeLinejoin={join}
      />
      <Path d="M9.5 12l1.8 1.8L15 10" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
    </Svg>
  );
}

export function IconPriceTag({ size = 14, color = '#11766F', strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin={join}
      />
      <Circle cx={7.5} cy={7.5} r={1.5} fill={color} />
    </Svg>
  );
}

export function IconTabHome({
  size = 22,
  color = '#6B7370',
  active = false,
}: IconProps & { active?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8.5z"
        stroke={color}
        strokeWidth={active ? 1.85 : 1.7}
        strokeLinecap={cap}
        strokeLinejoin={join}
        fill={active ? color : 'none'}
        fillOpacity={active ? 0.15 : 0}
      />
    </Svg>
  );
}

export function IconTabCalendar({ size = 22, color = '#6B7370', strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={5} width={16} height={15} rx={2} stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
      <Path d="M8 3v4M16 3v4M4 10h16" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
    </Svg>
  );
}

export function IconTabOrders({ size = 22, color = '#6B7370', strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8 6h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap={cap}
        strokeLinejoin={join}
      />
      <Path d="M6 8H5a2 2 0 0 0-2 2v10" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
      <Path d="M11 11h5M11 15h5" stroke={color} strokeWidth={strokeWidth} strokeLinecap={cap} strokeLinejoin={join} />
    </Svg>
  );
}

export function IconTabUser({ size = 22, color = '#6B7370', strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={3.5} stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="M5.5 19.5c1.8-3.2 4-4.5 6.5-4.5s4.7 1.3 6.5 4.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap={cap}
        strokeLinejoin={join}
      />
    </Svg>
  );
}
