/**
 * Minimal reader for legacy Excel .xls files (BIFF8 inside a Compound File),
 * enough for supplier exports like Wiio's OrderList. Returns the first
 * worksheet as rows of strings/numbers. No dependencies.
 *
 * Supported cells: shared strings (LABELSST), inline strings (LABEL), numbers
 * (NUMBER, RK, MULRK), formula results (FORMULA + STRING) and booleans.
 */

type Cell = string | number | boolean | null;

const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;

function readCompoundStream(buf: Buffer, names: string[]): Buffer {
  if (buf.readUInt32LE(0) !== 0xe011cfd0 || buf.readUInt32LE(4) !== 0xe11ab1a1) {
    throw new Error("Arquivo não é uma planilha .xls válida");
  }
  const sectorSize = 1 << buf.readUInt16LE(0x1e);
  const miniSectorSize = 1 << buf.readUInt16LE(0x20);
  const firstDirSector = buf.readUInt32LE(0x30);
  const miniCutoff = buf.readUInt32LE(0x38);
  const firstMiniFat = buf.readUInt32LE(0x3c);
  let difatSector = buf.readUInt32LE(0x44);
  const numDifat = buf.readUInt32LE(0x48);

  const sector = (n: number) => buf.subarray((n + 1) * sectorSize, (n + 2) * sectorSize);

  // FAT sector list from the header DIFAT (109 entries) plus DIFAT sectors.
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) {
    const s = buf.readUInt32LE(0x4c + i * 4);
    if (s !== FREESECT) fatSectors.push(s);
  }
  for (let d = 0; d < numDifat && difatSector !== ENDOFCHAIN && difatSector !== FREESECT; d++) {
    const sec = sector(difatSector);
    const per = sectorSize / 4 - 1;
    for (let i = 0; i < per; i++) {
      const s = sec.readUInt32LE(i * 4);
      if (s !== FREESECT) fatSectors.push(s);
    }
    difatSector = sec.readUInt32LE(per * 4);
  }
  const fat: number[] = [];
  for (const fs of fatSectors) {
    const sec = sector(fs);
    for (let i = 0; i < sectorSize / 4; i++) fat.push(sec.readUInt32LE(i * 4));
  }

  const chain = (start: number, table: number[]) => {
    const out: number[] = [];
    const seen = new Set<number>();
    for (let s = start; s !== ENDOFCHAIN && s !== FREESECT && s < table.length; s = table[s]) {
      if (seen.has(s)) throw new Error("Planilha corrompida (cadeia em loop)");
      seen.add(s);
      out.push(s);
    }
    return out;
  };
  const readRegular = (start: number, size: number) =>
    Buffer.concat(chain(start, fat).map(sector)).subarray(0, size);

  // Directory entries (128 bytes each).
  const dir = Buffer.concat(chain(firstDirSector, fat).map(sector));
  const entries: { name: string; type: number; start: number; size: number }[] = [];
  for (let off = 0; off + 128 <= dir.length; off += 128) {
    const nameLen = dir.readUInt16LE(off + 0x40);
    const name = nameLen > 2 ? dir.subarray(off, off + nameLen - 2).toString("utf16le") : "";
    entries.push({
      name,
      type: dir[off + 0x42],
      start: dir.readUInt32LE(off + 0x74),
      size: dir.readUInt32LE(off + 0x78),
    });
  }
  const root = entries.find((e) => e.type === 5);
  const entry = entries.find((e) => e.type === 2 && names.includes(e.name));
  if (!entry) throw new Error("A planilha não tem a aba de dados (Workbook)");

  if (entry.size >= miniCutoff || !root) return readRegular(entry.start, entry.size);

  // Small stream: lives in the mini stream, addressed through the mini FAT.
  const miniStream = readRegular(root.start, root.size);
  const miniFat: number[] = [];
  for (const s of chain(firstMiniFat, fat)) {
    const sec = sector(s);
    for (let i = 0; i < sectorSize / 4; i++) miniFat.push(sec.readUInt32LE(i * 4));
  }
  return Buffer.concat(
    chain(entry.start, miniFat).map((n) => miniStream.subarray(n * miniSectorSize, (n + 1) * miniSectorSize)),
  ).subarray(0, entry.size);
}

/** Reads across SST + CONTINUE records, honoring the per-segment high-byte flag. */
class SegReader {
  seg = 0;
  pos = 0;
  constructor(private segs: Buffer[]) {}
  private ensure() {
    while (this.seg < this.segs.length && this.pos >= this.segs[this.seg].length) {
      this.seg++;
      this.pos = 0;
    }
  }
  bytes(n: number): Buffer {
    const parts: Buffer[] = [];
    while (n > 0) {
      this.ensure();
      if (this.seg >= this.segs.length) throw new Error("SST truncada");
      const s = this.segs[this.seg];
      const take = Math.min(n, s.length - this.pos);
      parts.push(s.subarray(this.pos, this.pos + take));
      this.pos += take;
      n -= take;
    }
    return Buffer.concat(parts);
  }
  u8() {
    return this.bytes(1)[0];
  }
  u16() {
    return this.bytes(2).readUInt16LE(0);
  }
  u32() {
    return this.bytes(4).readUInt32LE(0);
  }
  chars(cch: number, high: boolean): string {
    let out = "";
    let left = cch;
    while (left > 0) {
      if (this.seg < this.segs.length && this.pos >= this.segs[this.seg].length) {
        // String continues in the next CONTINUE record, which starts with its own flag byte.
        this.seg++;
        this.pos = 0;
        if (this.seg >= this.segs.length) throw new Error("SST truncada");
        high = (this.segs[this.seg][this.pos++] & 1) === 1;
      }
      const s = this.segs[this.seg];
      const width = high ? 2 : 1;
      const n = Math.min(left, Math.floor((s.length - this.pos) / width));
      const raw = s.subarray(this.pos, this.pos + n * width);
      out += high ? raw.toString("utf16le") : raw.toString("latin1");
      this.pos += n * width;
      left -= n;
    }
    return out;
  }
}

function unicodeString(r: SegReader): string {
  const cch = r.u16();
  const flags = r.u8();
  const runs = flags & 0x08 ? r.u16() : 0;
  const ext = flags & 0x04 ? r.u32() : 0;
  const s = r.chars(cch, (flags & 1) === 1);
  if (runs) r.bytes(runs * 4);
  if (ext) r.bytes(ext);
  return s;
}

function inlineString(data: Buffer, offset: number): string {
  const cch = data.readUInt16LE(offset);
  const high = (data[offset + 2] & 1) === 1;
  const start = offset + 3;
  return high
    ? data.subarray(start, start + cch * 2).toString("utf16le")
    : data.subarray(start, start + cch).toString("latin1");
}

function rk(v: number): number {
  let n: number;
  if (v & 0x02) {
    n = v >> 2; // signed 30-bit integer
  } else {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(v & 0xfffffffc, 4);
    n = b.readDoubleLE(0);
  }
  return v & 0x01 ? n / 100 : n;
}

export function readXls(file: Buffer): Cell[][] {
  const wb = readCompoundStream(file, ["Workbook", "Book"]);
  const sst: string[] = [];
  const rows: Cell[][] = [];
  const set = (r: number, c: number, v: Cell) => {
    (rows[r] ??= [])[c] = v;
  };

  let inSheet = false;
  let done = false;
  let pendingFormula: [number, number] | null = null;

  for (let off = 0; off + 4 <= wb.length && !done; ) {
    const type = wb.readUInt16LE(off);
    const len = wb.readUInt16LE(off + 2);
    const data = wb.subarray(off + 4, off + 4 + len);
    let next = off + 4 + len;

    switch (type) {
      case 0x0809: // BOF
        if (data.readUInt16LE(2) === 0x0010) inSheet = true;
        break;
      case 0x000a: // EOF
        if (inSheet) done = true;
        break;
      case 0x00fc: {
        // SST + following CONTINUE records
        const segs = [data.subarray(8)];
        while (next + 4 <= wb.length && wb.readUInt16LE(next) === 0x003c) {
          const l = wb.readUInt16LE(next + 2);
          segs.push(wb.subarray(next + 4, next + 4 + l));
          next += 4 + l;
        }
        const unique = data.readUInt32LE(4);
        const r = new SegReader(segs);
        for (let i = 0; i < unique; i++) sst.push(unicodeString(r));
        break;
      }
      default:
        if (!inSheet) break;
        if (type === 0x00fd) set(data.readUInt16LE(0), data.readUInt16LE(2), sst[data.readUInt32LE(6)] ?? "");
        else if (type === 0x0204) set(data.readUInt16LE(0), data.readUInt16LE(2), inlineString(data, 6));
        else if (type === 0x0203) set(data.readUInt16LE(0), data.readUInt16LE(2), data.readDoubleLE(6));
        else if (type === 0x027e) set(data.readUInt16LE(0), data.readUInt16LE(2), rk(data.readUInt32LE(6)));
        else if (type === 0x00bd) {
          const row = data.readUInt16LE(0);
          const first = data.readUInt16LE(2);
          const n = (len - 6) / 6;
          for (let i = 0; i < n; i++) set(row, first + i, rk(data.readUInt32LE(4 + i * 6 + 2)));
        } else if (type === 0x0205) {
          set(data.readUInt16LE(0), data.readUInt16LE(2), data[7] === 0 ? data[6] === 1 : null);
        } else if (type === 0x0006) {
          const row = data.readUInt16LE(0);
          const col = data.readUInt16LE(2);
          if (data.readUInt16LE(12) === 0xffff) {
            if (data[6] === 0) pendingFormula = [row, col];
            else if (data[6] === 1) set(row, col, data[8] === 1);
            else set(row, col, null);
          } else set(row, col, data.readDoubleLE(6));
        } else if (type === 0x0207 && pendingFormula) {
          set(pendingFormula[0], pendingFormula[1], inlineString(data, 0));
          pendingFormula = null;
        }
    }
    off = next;
  }
  return Array.from(rows, (r) => Array.from(r ?? [], (c) => (c === undefined ? null : c)));
}

/** Minimal RFC 4180 CSV parser (comma or semicolon separated). */
export function readCsv(text: string): Cell[][] {
  const sep = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
