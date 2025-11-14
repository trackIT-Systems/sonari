/** Common types used for drawing
 *
 */

type RGB = `rgb(${number}, ${number}, ${number})`;
type RGBA = `rgba(${number}, ${number}, ${number}, ${number})`;
type HEX = `#${string}`;
type JSONArray = Array<JSONValue>;
type JSONValue = string | number | boolean | JSONObject | JSONArray;

export type Color = RGB | RGBA | HEX | string;
export interface JSONObject {
  [x: string]: JSONValue;
}
