// 라인 아이콘 세트 — Lucide (ISC). 1.6px 선, 라운드 캡으로 통일.
// 콘텐츠 JSON의 "icon" 값 → 아래 매핑 이름. 새 아이콘은 여기에 한 줄 추가.
import {
  Globe2, Landmark, Building2, Sun, Mountain, Snowflake, Users, Palette, Columns3, Vote, Scale,
  ShieldCheck, Building, Coins, LineChart, ArrowLeftRight, Handshake, Waves, Flag, Leaf,
  House, BookOpen, CircleX, Bookmark, Info, Search, Camera, PenLine, Check, ArrowRight,
  ArrowLeft, Sparkles, Box, Trash2, MapPin, NotebookPen, ImagePlus, CalendarCheck, Target, Lightbulb, type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  globe: Globe2, temple: Landmark, city: Building2, sun: Sun, mountain: Mountain, snow: Snowflake,
  people: Users, palette: Palette, columns: Columns3, vote: Vote, scale: Scale, shield: ShieldCheck,
  building: Building, coin: Coins, chart: LineChart, trade: ArrowLeftRight, handshake: Handshake,
  wave: Waves, flag: Flag, leaf: Leaf,
  home: House, book: BookOpen, wrong: CircleX, bookmark: Bookmark, settings: Info, search: Search,
  camera: Camera, pen: PenLine, check: Check, arrow: ArrowRight, back: ArrowLeft, spark: Sparkles,
  cube: Box, trash: Trash2, pin: MapPin, note: NotebookPen, photo: ImagePlus,
  review: CalendarCheck, target: Target, idea: Lightbulb,
};

export const ICON_NAMES = Object.keys(MAP);

export function Icon({ name, size = 22, stroke = 1.6, className }: { name: string; size?: number; stroke?: number; className?: string }) {
  const C = MAP[name] ?? Box;
  return <C className={className} size={size} strokeWidth={stroke} absoluteStrokeWidth={false} aria-hidden />;
}
