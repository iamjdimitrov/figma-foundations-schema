/// <reference path="../node_modules/@figma/plugin-typings/plugin-api.d.ts" />

// Data contracts only. Methods, document identities, and editor state are excluded.
type Data<T> = {
  [K in keyof T as T[K] extends (...args: any[]) => any ? never : K]: Exclude<T[K], symbol>
}
type StyleData<T> = Omit<Data<T>, keyof BaseStyleMixin | 'type' | 'boundVariables'>
type TextPreset = Partial<Pick<Data<NonResizableTextMixin>,
  'fontSize' | 'fontName' | 'fontWeight' | 'textCase' |
  'textDecoration' | 'textDecorationStyle' | 'textDecorationOffset' |
  'textDecorationThickness' | 'textDecorationColor' | 'textDecorationSkipInk' |
  'letterSpacing' | 'lineHeight' | 'leadingTrim' | 'paragraphIndent' |
  'paragraphSpacing' | 'listSpacing' | 'hangingPunctuation' | 'hangingList' |
  'textWrapStyle' | 'openTypeFeatures'>> & {
    fontStyle?: FontStyle
    textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED'
    textAlignVertical?: 'TOP' | 'CENTER' | 'BOTTOM'
    textAutoResize?: 'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'TRUNCATE'
    textTruncation?: 'DISABLED' | 'ENDING'
    maxLines?: number | null
    listOptions?: TextListOptions
    indentation?: number
  }
type StrokePreset = Partial<Pick<Data<MinimalStrokesMixin>,
  'strokes' | 'strokeWeight' | 'strokeJoin' | 'strokeAlign' | 'dashPattern'>> &
  Partial<Data<IndividualStrokesMixin>> & Partial<Data<ComplexStrokesMixin>> & {
    strokeCap?: StrokeCap
    strokeMiterLimit?: number
  }
type CornerPreset = Partial<Data<CornerMixin> & Data<RectangleCornerMixin>>
type LayoutPreset = Partial<Data<AutoLayoutMixin> & Data<GridLayoutMixin> &
  Data<AutoLayoutChildrenMixin> & Data<GridChildrenMixin>> & {
    layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL'
    layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL'
    minWidth?: number | null
    maxWidth?: number | null
    minHeight?: number | null
    maxHeight?: number | null
  }
interface NativeContract {
  paint: Paint
  paintStack: Paint[]
  effect: Effect
  effectStack: Effect[]
  layoutGrid: LayoutGrid
  gridStack: LayoutGrid[]
  textStyle: StyleData<TextStyle>
  textProperties: TextPreset
  stroke: StrokePreset
  corners: CornerPreset
  layoutProperties: LayoutPreset
  easing: MotionEasing
  spring: PhysicalSpring
  motionStyle: StyleData<CustomAnimationStyle>
  motionProperties: FigmaAnimationStyleConfiguration | CustomAnimationStyleConfiguration
  vectorArtwork: VectorNetwork
}
