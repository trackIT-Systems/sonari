/** Common types used for drawing
 *
 */

export type RGB = `rgb(${number}, ${number}, ${number})`;
export type RGBA = `rgba(${number}, ${number}, ${number}, ${number})`;
export type HEX = `#${string}`;
export type Color = RGB | RGBA | HEX | string;

export type JSONValue = string | number | boolean | JSONObject | JSONArray;

export interface JSONObject {
  [x: string]: JSONValue;
}

export type JSONArray = Array<JSONValue>;