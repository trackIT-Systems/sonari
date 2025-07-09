import { z } from "zod";

import {
  AnnotationProjectSchema,
  AnnotationStatusBadgeSchema,
  AnnotationStatusSchema,
  AnnotationTagSchema,
  AnnotationTaskSchema,
  BoundingBoxSchema,
  ClipAnnotationSchema,
  ClipSchema,
  DatasetSchema,
  DateFilterSchema,
  FeatureSchema,
  FileStateSchema,
  FloatEqFilterSchema,
  GeometrySchema,
  GeometryTypeSchema,
  IntegerFilterSchema,
  IntervalSchema,
  LineStringSchema,
  MultiLineStringSchema,
  MultiPointSchema,
  MultiPolygonSchema,
  NoteSchema,
  NumberFilterSchema,
  PointSchema,
  PolygonSchema,
  RecordingSchema,
  RecordingStateSchema,
  SoundEventAnnotationSchema,
  SoundEventSchema,
  SpectrogramParametersSchema,
  SpectrogramWindowSchema,
  StringFilterSchema,
  TagSchema,
  TimeFilterSchema,
  TimeIntervalSchema,
  TimeStampSchema,
  UserSchema,
} from "@/schemas";

export type User = z.infer<typeof UserSchema>;

export type Tag = z.infer<typeof TagSchema>;

export type Feature = z.infer<typeof FeatureSchema>;

export type Note = z.infer<typeof NoteSchema>;

export type Recording = z.infer<typeof RecordingSchema>;

export type FileState = z.infer<typeof FileStateSchema>;

export type RecordingState = z.infer<typeof RecordingStateSchema>;

export type Dataset = z.infer<typeof DatasetSchema>;

export type GeometryType = z.infer<typeof GeometryTypeSchema>;

export type TimeStamp = z.infer<typeof TimeStampSchema>;

export type TimeInterval = z.infer<typeof TimeIntervalSchema>;

export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

export type Point = z.infer<typeof PointSchema>;

export type LineString = z.infer<typeof LineStringSchema>;

export type Polygon = z.infer<typeof PolygonSchema>;

export type MultiPoint = z.infer<typeof MultiPointSchema>;

export type MultiLineString = z.infer<typeof MultiLineStringSchema>;

export type MultiPolygon = z.infer<typeof MultiPolygonSchema>;

export type Geometry = z.infer<typeof GeometrySchema>;

export type SoundEvent = z.infer<typeof SoundEventSchema>;

export type Clip = z.infer<typeof ClipSchema>;

export type AnnotationTag = z.infer<typeof AnnotationTagSchema>;

export type SoundEventAnnotation = z.infer<typeof SoundEventAnnotationSchema>;

export type ClipAnnotation = z.infer<typeof ClipAnnotationSchema>;

export type AnnotationStatus = z.infer<typeof AnnotationStatusSchema>;

export type AnnotationStatusBadge = z.infer<typeof AnnotationStatusBadgeSchema>;

export type AnnotationTask = z.infer<typeof AnnotationTaskSchema>;

export type AnnotationProject = z.infer<typeof AnnotationProjectSchema>;

export type Position = {
  time: number;
  freq: number;
};

export type Pixel = {
  x: number;
  y: number;
};

export type Coordinates = number[];

export type Box = [number, number, number, number];

export type Dimensions = {
  width: number;
  height: number;
};

export type WaveformWindow = {
  time: { min: number; max: number };
};

export type Interval = z.infer<typeof IntervalSchema>;

export type SpectrogramWindow = z.infer<typeof SpectrogramWindowSchema>;

export type SpectrogramParameters = z.infer<typeof SpectrogramParametersSchema>;

export type JSONValue = string | number | boolean | JSONObject | JSONArray;

export interface JSONObject {
  [x: string]: JSONValue;
}

export type JSONArray = Array<JSONValue>;

export type DateFilter = z.input<typeof DateFilterSchema>;

export type TimeFilter = z.input<typeof TimeFilterSchema>;

export type NumberFilter = z.input<typeof NumberFilterSchema>;

export type StringFilter = z.input<typeof StringFilterSchema>;

export type IntegerFilter = z.input<typeof IntegerFilterSchema>;

export type FloatEqFilter = z.input<typeof FloatEqFilterSchema>;
