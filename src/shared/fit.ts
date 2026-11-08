/**
 * A writer for Garmin FIT course files, after the message layout of
 * coursepointer (github.com/mshroyer/coursepointer): file_id, course, lap,
 * timer start, records, course points, timer stop, file_creator.
 * https://developer.garmin.com/fit/file-types/course/
 */

/** The course_point `type` enum of the FIT profile. */
export const CoursePointType = {
  Generic: 0,
  Summit: 1,
  Valley: 2,
  Water: 3,
  Food: 4,
  Danger: 5,
  Left: 6,
  Right: 7,
  Straight: 8,
  FirstAid: 9,
  FourthCategory: 10,
  ThirdCategory: 11,
  SecondCategory: 12,
  FirstCategory: 13,
  HorsCategory: 14,
  Sprint: 15,
  LeftFork: 16,
  RightFork: 17,
  MiddleFork: 18,
  SlightLeft: 19,
  SharpLeft: 20,
  SlightRight: 21,
  SharpRight: 22,
  UTurn: 23,
  SegmentStart: 24,
  SegmentEnd: 25,
  Campsite: 27,
  AidStation: 28,
  RestArea: 29,
  GeneralDistance: 30,
  Service: 31,
  EnergyGel: 32,
  SportsDrink: 33,
  MileMarker: 34,
  Checkpoint: 35,
  Shelter: 36,
  MeetingSpot: 37,
  Overlook: 38,
  Toilet: 39,
  Shower: 40,
  Gear: 41,
  SharpCurve: 42,
  SteepIncline: 43,
  Tunnel: 44,
  Bridge: 45,
  Obstacle: 46,
  Crossing: 47,
  Store: 48,
  Transition: 49,
  Navaid: 50,
  Transport: 51,
  Alert: 52,
  Info: 53,
} as const;
export type CoursePointType =
  (typeof CoursePointType)[keyof typeof CoursePointType];

/** The FIT profile's `sport` enum, what of it fits a costing. */
export const Sport = {
  Generic: 0,
  Running: 1,
  Cycling: 2,
  Walking: 11,
  Hiking: 17,
  EBiking: 21,
  Motorcycling: 22,
  Driving: 24,
} as const;
export type Sport = (typeof Sport)[keyof typeof Sport];

export type FitRecord = {
  lon: number;
  lat: number;
  /** Meters from the start. */
  distance: number;
  /** Seconds from the start. */
  time: number;
  /** Meters; the field is left out of every record unless all have one. */
  altitude?: number;
};

export type FitCoursePoint = {
  lon: number;
  lat: number;
  distance: number;
  time: number;
  type: CoursePointType;
  /** Cut to 15 bytes of UTF-8. */
  name: string;
};

export type FitCourse = {
  name: string;
  sport: Sport;
  start: Date;
  records: FitRecord[];
  coursePoints: FitCoursePoint[];
  /** Meters, for the lap. */
  ascent?: number;
  descent?: number;
};

const PROFILE_VERSION = 21158;
// seconds from the Unix epoch to the FIT one, 1989-12-31T00:00:00Z
const FIT_EPOCH = 631065600;
const COURSE_NAME_SIZE = 32;
const POINT_NAME_SIZE = 16;
const PRODUCT_NAME_SIZE = 14;

const ENUM = 0x00;
const UINT8 = 0x02;
const UINT16 = 0x84;
const SINT32 = 0x85;
const UINT32 = 0x86;
const STRING = 0x07;

const MESG = {
  fileId: 0,
  lap: 19,
  record: 20,
  event: 21,
  course: 31,
  coursePoint: 32,
  fileCreator: 49,
} as const;

type Field = [number: number, size: number, type: number];

const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001,
  0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
];

export function crc(bytes: Uint8Array, from = 0, to = bytes.length) {
  let sum = 0;
  for (let i = from; i < to; i++) {
    const byte = bytes[i]!;
    let tmp = CRC_TABLE[sum & 0xf]!;
    sum = (sum >> 4) & 0x0fff;
    sum = sum ^ tmp ^ CRC_TABLE[byte & 0xf]!;
    tmp = CRC_TABLE[sum & 0xf]!;
    sum = (sum >> 4) & 0x0fff;
    sum = sum ^ tmp ^ CRC_TABLE[byte >> 4]!;
  }
  return sum;
}

/** UTF-8 of `text` cut to whole characters in `size - 1` bytes, zero-padded to `size`. */
export function fixedString(text: string, size: number) {
  const out = new Uint8Array(size);
  const encoder = new TextEncoder();
  let used = 0;
  for (const char of text) {
    const bytes = encoder.encode(char);
    if (used + bytes.length > size - 1) break;
    out.set(bytes, used);
    used += bytes.length;
  }
  return out;
}

const semicircles = (degrees: number) =>
  Math.round((degrees * 2 ** 31) / 180) | 0;

/** Little-endian bytes, grown as needed. */
class Writer {
  private buf = new Uint8Array(1024);
  private view = new DataView(this.buf.buffer);
  length = 0;

  private room(n: number) {
    if (this.length + n <= this.buf.length) return;
    const next = new Uint8Array(Math.max(this.buf.length * 2, this.length + n));
    next.set(this.buf);
    this.buf = next;
    this.view = new DataView(next.buffer);
  }
  u8(v: number) {
    this.room(1);
    this.view.setUint8(this.length++, v);
  }
  u16(v: number) {
    this.room(2);
    this.view.setUint16(this.length, v, true);
    this.length += 2;
  }
  u32(v: number) {
    this.room(4);
    this.view.setUint32(this.length, v, true);
    this.length += 4;
  }
  i32(v: number) {
    this.room(4);
    this.view.setInt32(this.length, v, true);
    this.length += 4;
  }
  bytes(b: Uint8Array) {
    this.room(b.length);
    this.buf.set(b, this.length);
    this.length += b.length;
  }
  setU32(at: number, v: number) {
    this.view.setUint32(at, v, true);
  }
  result() {
    return this.buf.slice(0, this.length);
  }
}

/** Altitude as the record field has it: uint16, scale 5, offset 500 m. */
const fitAltitude = (meters: number) => Math.round((meters + 500) * 5);
// 0xffff means unknown, which devices show as 12,607 m instead
const altitudeFits = (meters: number | undefined) =>
  typeof meters === "number" &&
  Number.isFinite(meters) &&
  fitAltitude(meters) >= 0 &&
  fitAltitude(meters) < 0xffff;

const clampU16 = (v: number) => Math.min(0xfffe, Math.max(0, Math.round(v)));

export function encodeCourse(course: FitCourse): Uint8Array {
  const w = new Writer();
  const start = Math.floor(course.start.getTime() / 1000) - FIT_EPOCH;
  const at = (seconds: number) => start + Math.floor(seconds);
  const centimeters = (meters: number) => Math.round(meters * 100);

  // header: size, protocol 1.0, profile, data size (set below), ".FIT", CRC
  w.u8(14);
  w.u8(0x10);
  w.u16(PROFILE_VERSION);
  w.u32(0);
  w.bytes(new TextEncoder().encode(".FIT"));
  w.u16(0);

  const define = (local: number, global: number, fields: Field[]) => {
    w.u8(0x40 | local);
    w.u8(0); // reserved
    w.u8(0); // little endian
    w.u16(global);
    w.u8(fields.length);
    for (const [num, size, type] of fields) {
      w.u8(num);
      w.u8(size);
      w.u8(type);
    }
  };

  define(0, MESG.fileId, [
    [0, 1, ENUM], // type
    [1, 2, UINT16], // manufacturer
    [4, 4, UINT32], // time_created
    [8, PRODUCT_NAME_SIZE, STRING], // product_name
  ]);
  w.u8(0);
  w.u8(6); // course
  w.u16(255); // development
  w.u32(start);
  w.bytes(fixedString("Valhalla", PRODUCT_NAME_SIZE));

  define(1, MESG.course, [
    [5, COURSE_NAME_SIZE, STRING], // name
    [4, 1, ENUM], // sport
  ]);
  w.u8(1);
  w.bytes(fixedString(course.name, COURSE_NAME_SIZE));
  w.u8(course.sport);

  const { records } = course;
  const first = records[0];
  const last = records.at(-1);
  const duration = last?.time ?? 0;
  const hasClimb =
    typeof course.ascent === "number" && typeof course.descent === "number";
  define(2, MESG.lap, [
    [2, 4, UINT32], // start_time
    [253, 4, UINT32], // timestamp
    [7, 4, UINT32], // total_elapsed_time, ms
    [8, 4, UINT32], // total_timer_time, ms
    [9, 4, UINT32], // total_distance, cm
    ...(first && last
      ? ([
          [3, 4, SINT32], // start_position_lat
          [4, 4, SINT32], // start_position_long
          [5, 4, SINT32], // end_position_lat
          [6, 4, SINT32], // end_position_long
        ] as Field[])
      : []),
    ...(hasClimb
      ? ([
          [21, 2, UINT16], // total_ascent, m
          [22, 2, UINT16], // total_descent, m
        ] as Field[])
      : []),
  ]);
  w.u8(2);
  w.u32(start);
  w.u32(at(duration));
  w.u32(Math.round(duration * 1000));
  w.u32(Math.round(duration * 1000));
  w.u32(centimeters(last?.distance ?? 0));
  if (first && last) {
    w.i32(semicircles(first.lat));
    w.i32(semicircles(first.lon));
    w.i32(semicircles(last.lat));
    w.i32(semicircles(last.lon));
  }
  if (hasClimb) {
    w.u16(clampU16(course.ascent!));
    w.u16(clampU16(course.descent!));
  }

  const timer = (eventType: number, time: number) => {
    w.u8(3);
    w.u32(at(time));
    w.u8(0); // timer
    w.u8(0); // event_group
    w.u8(eventType);
  };
  define(3, MESG.event, [
    [253, 4, UINT32], // timestamp
    [0, 1, ENUM], // event
    [4, 1, UINT8], // event_group
    [1, 1, ENUM], // event_type
  ]);
  timer(0, 0); // start

  // all or nothing, as devices don't take an unknown altitude for one
  const withAltitude =
    records.length > 0 && records.every((r) => altitudeFits(r.altitude));
  define(4, MESG.record, [
    [0, 4, SINT32], // position_lat
    [1, 4, SINT32], // position_long
    [5, 4, UINT32], // distance, cm
    [253, 4, UINT32], // timestamp
    ...(withAltitude ? ([[2, 2, UINT16]] as Field[]) : []), // altitude
  ]);
  for (const r of records) {
    w.u8(4);
    w.i32(semicircles(r.lat));
    w.i32(semicircles(r.lon));
    w.u32(centimeters(r.distance));
    w.u32(at(r.time));
    if (withAltitude) w.u16(fitAltitude(r.altitude!));
  }

  if (course.coursePoints.length) {
    define(5, MESG.coursePoint, [
      [254, 2, UINT16], // message_index
      [1, 4, UINT32], // timestamp
      [2, 4, SINT32], // position_lat
      [3, 4, SINT32], // position_long
      [4, 4, UINT32], // distance, cm
      [5, 1, ENUM], // type
      [6, POINT_NAME_SIZE, STRING], // name
    ]);
    course.coursePoints.forEach((p, i) => {
      w.u8(5);
      w.u16(i);
      w.u32(at(p.time));
      w.i32(semicircles(p.lat));
      w.i32(semicircles(p.lon));
      w.u32(centimeters(p.distance));
      w.u8(p.type);
      w.bytes(fixedString(p.name, POINT_NAME_SIZE));
    });
  }

  timer(1, duration); // stop

  define(6, MESG.fileCreator, [
    [0, 2, UINT16], // software_version
    [1, 1, UINT8], // hardware_version
  ]);
  w.u8(6);
  w.u16(0);
  w.u8(0);

  w.setU32(4, w.length - 14);
  const bytes = w.result();
  const headerCrc = crc(bytes, 0, 12);
  bytes[12] = headerCrc & 0xff;
  bytes[13] = headerCrc >> 8;
  const dataCrc = crc(bytes, 14);
  const out = new Uint8Array(bytes.length + 2);
  out.set(bytes);
  out[bytes.length] = dataCrc & 0xff;
  out[bytes.length + 1] = dataCrc >> 8;
  return out;
}
