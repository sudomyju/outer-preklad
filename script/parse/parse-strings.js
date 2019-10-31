'use strict';
const fs = require('fs');
const { FileSource } = require('./parse-source');

const OBJECT_CLOSE = 0x0E;

/**
 * Strings file parser.
 */
class StringsParser {

    constructor(source) {
        this.source = source;
    }

    fail(message) {
        throw new Error(`${message || 'Unexpected value'} at ${this.source.cursor()}`);
    }

    parse() {
        let result = {};
        // UEXP header
        0x14 === this.source.readUInt64LE() || this.fail();
        0x0C === this.source.readUInt64LE() || this.fail();
        result.size = this.source.readUInt64LE();
        0x15 === this.source.readUInt64LE() || this.fail();
        0x16 === this.source.readUInt64LE() ||  this.fail();
        '0000000000' === this.source.readHex(5) || this.fail();
        result.groups = this.parseArray(this.parseGroup);
        0x08 === this.source.readUInt64LE() || this.fail();
        0x0B === this.source.readUInt64LE() || this.fail();
        0x04 === this.source.readUInt64LE() || this.fail();
        0x00 === this.source.readUInt8() || this.fail();
        result.magic = this.source.readUInt32LE();
        this.source.readUInt64LE() === OBJECT_CLOSE || this.fail();
        // UEXP footer
        0x00 === this.source.readUInt32LE() || this.fail();
        'C1832A9E' === this.source.readHex(4) || this.fail();
        return result;
    }

    parseString() {
        let length = this.source.readUInt32LE();
        let wide = length > 0xFF000000;
        let buffer = this.source.read(wide ? (0xFFFFFFFF - length + 1) * 2 : length);
        return buffer.slice(0, wide ? -2 : -1).toString(wide ? 'UTF-16LE' : 'UTF-8');
    }

    parseGroup() {
        let group = {
            _: this.source.cursor(),
            id: this.parseString()
        };
        0x0D === this.source.readUInt64LE() || this.fail();
        0x15 === this.source.readUInt64LE() || this.fail();
        // size of name/id (UInt32:length ZString:value)
        let size = this.source.readUInt64LE();
        0x00 === this.source.readUInt8() || this.fail();
        group.name = this.parseString();
        0x12 === this.source.readUInt64LE() || this.fail();
        0x10 === this.source.readUInt64LE() || this.fail();
        group.unk1 = this.source.readUInt64LE(); // XXX sizeof(vars)
        0x0B === this.source.readUInt64LE() || this.fail();
        '0000000000' === this.source.readHex(5) || this.fail();
        group.vars = this.parseArray(() => this.source.readUInt32LE()); // String IDs for interpolation
        0x11 === this.source.readUInt64LE() || this.fail();
        0x0C === this.source.readUInt64LE() || this.fail();
        group.unk3 = this.source.readUInt64LE(); // XXX sizeof(unk4)
        0x15 === this.source.readUInt64LE() || this.fail();
        0x16 === this.source.readUInt64LE() || this.fail();
        '0000000000' === this.source.readHex(5) || this.fail();
        let unk4 = this.source.readUInt32LE();
        if (unk4 === 1) {
            group.unk4 = {
                lang: this.parseString()
            };
            0x0A === this.source.readUInt64LE() || this.fail();
            0x10 === this.source.readUInt64LE() || this.fail();
            group.unk4.size = this.source.readUInt64LE(); // XXX sizeof(values)
            0x0B === this.source.readUInt64LE() || this.fail();
            '0000000000' === this.source.readHex(5) || this.fail();
            group.unk4.values = this.parseArray(() => this.source.readUInt32LE());
            this.source.readUInt64LE() === OBJECT_CLOSE || this.fail();
        } else if (unk4 > 1) {
            false, `Illegal flag value ${unk4}` || this.fail();
        }
        0x06 === this.source.readUInt64LE() || this.fail();
        0x0C === this.source.readUInt64LE() || this.fail();
        group.unk5 = this.source.readUInt64LE(); // XXX sizeof(entries)
        0x0B === this.source.readUInt64LE() || this.fail();
        0x16 === this.source.readUInt64LE() || this.fail();
        '0000000000' === this.source.readHex(5) || this.fail();
        group.entries = this.parseArray(this.parseEntry);
        this.source.readUInt64LE() === OBJECT_CLOSE || this.fail();
        return group;
    }

    parseArray(parseElement) {
        let count = this.source.readUInt32LE();
        let values = []
        for (let i = 0; i < count; i++) {
            values.push(parseElement.call(this, i));
        }
        return values;
    }

    parseEntry() {
        let entry = {
            id: this.source.readUInt32LE()
        };
        0x09 === this.source.readUInt64LE() || this.fail();
        0x0B === this.source.readUInt64LE() || this.fail();
        0x04 === this.source.readUInt64LE() || this.fail();
        0x00 === this.source.readUInt8() || this.fail();
        entry.id === this.source.readUInt32LE() || this.fail();
        0x05 === this.source.readUInt64LE() || this.fail();
        0x15 === this.source.readUInt64LE() || this.fail();
        // size of default text (UInt32:length ZString:value)
        let size = this.source.readUInt64LE();
        this.source.readUInt8() == 0x00 || this.fail();
        entry.string = this.parseString();
        0x07 === this.source.readUInt64LE() || this.fail();
        0x15 === this.source.readUInt64LE() || this.fail();
        // size of female text (UInt32:length ZString:value)
        let size2 = this.source.readUInt64LE();
        0x00 === this.source.readUInt8() || this.fail();;
        let string2 = this.parseString();
        if (string2) {
            entry.string2 = string2;
        }
        this.source.readUInt64LE() === OBJECT_CLOSE || this.fail();
        return entry;
    }

}
module.exports.StringsParser = StringsParser;

/**
 * Strings file reader.
 */
class StringsReader {

    constructor() {
    }

    readFile(filename) {
        return new StringsParser(new FileSource(filename)).parse();
    }

}
module.exports.StringsReader = StringsReader;
