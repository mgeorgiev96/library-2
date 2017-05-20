/*
 * Copyright 2008 ZXing authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License")
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*package com.google.zxing.common;*/

import * as assert from 'assert'
import * as async from 'async'
import SharpImage from './../util/SharpImage'
import SharpImageLuminanceSource from './../SharpImageLuminanceSource'
import BarcodeFormat from './../../lib/BarcodeFormat'
import BinaryBitmap from './../../lib/BinaryBitmap'
import DecodeHintType from './../../lib/DecodeHintType'
import './../../lib/InvertedLuminanceSource'
import LuminanceSource from './../../lib/LuminanceSource'
import Reader from './../../lib/Reader'
import Result from './../../lib/Result'
import ResultMetadataType from './../../lib/ResultMetadataType'
import TestResult from './../common/TestResult'
import HybridBinarizer from './../../lib/common/HybridBinarizer'
import StringEncoding from './../../lib/util/StringEncoding'
const fs = require('fs')
const path = require('path')

/*import javax.imageio.ImageIO;*/
/*import java.awt.Graphics;*/
/*import java.awt.geom.AffineTransform;*/
/*import java.awt.geom.RectangularShape;*/
/*import java.awt.image.AffineTransformOp;*/
/*import java.awt.image.BufferedImage;*/
/*import java.awt.image.BufferedImageOp;*/
/*import java.io.BufferedReader;*/
/*import java.io.IOException;*/
/*import java.nio.charset.Charset;*/
/*import java.nio.charset.StandardCharsets;*/
/*import java.nio.file.DirectoryStream;*/
/*import java.nio.file.Files;*/
/*import java.nio.file.Path;*/
/*import java.nio.file.Paths;*/
/*import java.util.ArrayList;*/
/*import java.util.EnumMap;*/
/*import java.util.List;*/
/*import java.util.Map;*/
/*import java.util.Properties;*/
/*import java.util.logging.Logger;*/

/**
 * @author Sean Owen
 * @author dswitkin@google.com (Daniel Switkin)
 */
abstract class AbstractBlackBoxTestCase {

  private testBase: string
  private testResults: Array<TestResult>

  public static buildTestBase(testBasePathSuffix: string): string {
    let testBase = path.resolve(testBasePathSuffix)
    // TYPESCRIPTPORT: not applicable
    // if (!fs.existsSync(testBase)) {
    //   // try starting with 'core' since the test base is often given as the project root
    //   testBase = path.resolve("core", testBasePathSuffix)
    // }
    return testBase
  }

  protected constructor(testBasePathSuffix: string,
                        private barcodeReader: Reader,
                        private expectedFormat: BarcodeFormat) {
    this.testBase = AbstractBlackBoxTestCase.buildTestBase(testBasePathSuffix)
    this.testResults = new Array<TestResult>()
  }

  protected getTestBase(): string {
    return this.testBase
  }

  protected addTest(mustPassCount: number/*int*/,
                    tryHarderCount: number/*int*/,
                    rotation: number/*float*/): void {
    this.addTestWithMax(mustPassCount, tryHarderCount, 0, 0, rotation)
  }
  /**
   * Adds a new test for the current directory of images.
   *
   * @param mustPassCount The number of images which must decode for the test to pass.
   * @param tryHarderCount The number of images which must pass using the try harder flag.
   * @param maxMisreads Maximum number of images which can fail due to successfully reading the wrong contents
   * @param maxTryHarderMisreads Maximum number of images which can fail due to successfully
   *                             reading the wrong contents using the try harder flag
   * @param rotation The rotation in degrees clockwise to use for this test.
   */
  protected addTestWithMax(mustPassCount: number/*int*/,
                    tryHarderCount: number/*int*/,
                    maxMisreads: number/*int*/ = 0,
                    maxTryHarderMisreads: number/*int*/ = 0,
                    rotation: number/*float*/): void {
    this.testResults.push(new TestResult(mustPassCount, tryHarderCount, maxMisreads, maxTryHarderMisreads, rotation))
  }

  private walkDirectory(dirPath: string) {
    const me = this
    let results = new Array<string>()
    const dir = path.resolve(this.testBase, dirPath)
    const list = fs.readdirSync(dir)
    list.forEach((file: string) => {
        file = path.join(dir, file)
        const stat = fs.statSync(file)
        if (stat && stat.isDirectory()) {
          results = results.concat(me.walkDirectory(file))
        } else {
          if ([".jpg",".jpeg",".gif",".png"].indexOf(path.extname(file)) !== -1) {
            results.push(file)
          }
        }
    })

    if (results.length === 0) {
        console.log(`No files in folder ${dir}`)
    }

    return results
}

  protected getImageFiles(): Array<string> /*throws IOException*/ {
    assert.strictEqual(fs.existsSync(this.testBase), true, "Please download and install test images, and run from the 'core' directory")
    const paths = this.walkDirectory(this.testBase)
    return paths
  }

  protected getReader(): Reader {
    return this.barcodeReader
  }

  // This workaround is used because AbstractNegativeBlackBoxTestCase overrides this method but does
  // not return SummaryResults.
  public testBlackBox(done: () => any): void /*throws IOException */{
    this.testBlackBoxCountingResults(true, done)
  }

  private testBlackBoxCountingResults(assertOnFailure: boolean, done: () => any): void /*throws IOException */{
    assert.strictEqual(this.testResults.length > 0, true)

    const imageFiles: Array<string> = this.getImageFiles()
    const testCount: number/*int*/ = this.testResults.length

    const passedCounts = new Int32Array(testCount)/*Int32Array(testCount)*/
    const misreadCounts = new Int32Array(testCount)/*Int32Array(testCount)*/
    const tryHarderCounts = new Int32Array(testCount)/*Int32Array(testCount)*/
    const tryHarderMisreadCounts = new Int32Array(testCount)/*Int32Array(testCount)*/

    const me = this
    async.eachSeries(imageFiles, (testImage, callback) => {
      console.log(`Starting ${testImage}`)
      const rotations: number[] = [0, 90, 180, 270]//TODO: take rotations from testResults input
      SharpImage.load(testImage, rotations, (err, images: Map<number, SharpImage>) => {
        if (err) {
          callback(err)
        } else {
          const fileBaseName: string = path.basename(testImage, path.extname(testImage))
          let expectedTextFile: string = path.resolve(this.testBase, fileBaseName + ".txt")
          let expectedText: string
          if (fs.existsSync(expectedTextFile)) {
            expectedText = AbstractBlackBoxTestCase.readTextFileAsString(expectedTextFile)
          } else {
            expectedTextFile = path.resolve(fileBaseName + ".bin")
            assert.strictEqual(fs.existsSync(expectedTextFile), true)
            expectedText = AbstractBlackBoxTestCase.readBinFileAsString(expectedTextFile)
          }

          const expectedMetadataFile: string = path.resolve(fileBaseName + ".metadata.txt")
          let expectedMetadata = null
          if (fs.existsSync(expectedMetadataFile)) {
            expectedMetadata = AbstractBlackBoxTestCase.readTextFileAsMetadata(expectedMetadataFile)
          }

          for (let x: number/*int*/ = 0; x < testCount; x++) {
            const rotation: number/*float*/ = this.testResults[x].getRotation()
            const rotatedImage: SharpImage = images.get(rotation)
            const source: LuminanceSource = new SharpImageLuminanceSource(rotatedImage)
            const bitmap = new BinaryBitmap(new HybridBinarizer(source))
            try {
              if (me.decode(bitmap, rotation, expectedText, expectedMetadata, false)) {
                passedCounts[x]++
              } else {
                misreadCounts[x]++
              }
            } catch (ignored/*ReaderException*/) {
              console.log(`could not read at rotation ${rotation}`)
            }
            try {
              if (me.decode(bitmap, rotation, expectedText, expectedMetadata, true)) {
                tryHarderCounts[x]++
              } else {
                tryHarderMisreadCounts[x]++
              }
            } catch (ignored/*ReaderException*/) {
              console.log(`could not read at rotation ${rotation} w/TH`)
            }
          }

          callback()
        }
      })
    }, (err) => {
      if (err) {
        console.error(err)
      } else {
        // Print the results of all tests first
        let totalFound: number/*int*/ = 0
        let totalMustPass: number/*int*/ = 0
        let totalMisread: number/*int*/ = 0
        let totalMaxMisread: number/*int*/ = 0

        for (let x: number/*int*/ = 0, length = me.testResults.length; x < length; x++) {
          const testResult: TestResult = me.testResults[x]
          console.log(`Rotation ${testResult.getRotation()} degrees:`)
          console.log(` ${passedCounts[x]} of ${imageFiles.length} images passed (${testResult.getMustPassCount()} required)`)
          let failed: number/*int*/ = imageFiles.length - passedCounts[x]
          console.log(` ${misreadCounts[x]} failed due to misreads, ${failed - misreadCounts[x]} not detected`)
          console.log(` ${tryHarderCounts[x]} of ${imageFiles.length} images passed with try harder (${testResult.getTryHarderCount()} required)`)
          failed = imageFiles.length - tryHarderCounts[x]
          console.log(` ${tryHarderMisreadCounts[x]} failed due to misreads, ${failed - tryHarderMisreadCounts[x]} not detected`)
          totalFound += passedCounts[x] + tryHarderCounts[x]
          totalMustPass += testResult.getMustPassCount() + testResult.getTryHarderCount()
          totalMisread += misreadCounts[x] + tryHarderMisreadCounts[x]
          totalMaxMisread += testResult.getMaxMisreads() + testResult.getMaxTryHarderMisreads()
        }

        const totalTests: number/*int*/ = imageFiles.length * testCount * 2
        console.log(`Decoded ${totalFound} images out of ${totalTests} (${totalFound * 100 / totalTests}%, ${totalMustPass} required)`)
        if (totalFound > totalMustPass) {
          console.warn(`+++ Test too lax by ${totalFound - totalMustPass} images`)
        } else if (totalFound < totalMustPass) {
          console.error(`--- Test failed by ${totalMustPass - totalFound} images`)
        }

        if (totalMisread < totalMaxMisread) {
          console.warn(`+++ Test expects too many misreads by ${totalMaxMisread - totalMisread} images`)
        } else if (totalMisread > totalMaxMisread) {
          console.error(`--- Test had too many misreads by ${totalMisread - totalMaxMisread} images`)
        }

        // Then run through again and assert if any failed
        if (assertOnFailure) {
          for (let x: number/*int*/ = 0; x < testCount; x++) {
            const testResult: TestResult = me.testResults[x]
            let label: string = "Rotation " + testResult.getRotation() + " degrees: Too many images failed"
            assert.strictEqual(passedCounts[x] >= testResult.getMustPassCount(), true, label)
            assert.strictEqual(tryHarderCounts[x] >= testResult.getTryHarderCount(), true, "Try harder, " + label)
            label = "Rotation " + testResult.getRotation() + " degrees: Too many images misread"
            assert.strictEqual(misreadCounts[x] <= testResult.getMaxMisreads(), true, label)
            assert.strictEqual(tryHarderMisreadCounts[x] <= testResult.getMaxTryHarderMisreads(), true, "Try harder, " + label)
          }
        }
      }

      done()
    })
  }

  private decode(source: BinaryBitmap,
                  rotation: number/*float*/,
                  expectedText: string,
                  expectedMetadata: Map<string, string>,
                  tryHarder: boolean): boolean /*throws ReaderException */{

    const suffix: string = ` (${tryHarder ? "try harder, " : ""}rotation: ${rotation})`

    const hints = new Map<DecodeHintType, any>()
    if (tryHarder) {
      hints.set(DecodeHintType.TRY_HARDER, true)
    }

    // Try in 'pure' mode mostly to exercise PURE_BARCODE code paths for exceptions;
    // not expected to pass, generally
    let result: Result = null
    try {
      const pureHints = new Map<DecodeHintType, any>(hints)
      pureHints.set(DecodeHintType.PURE_BARCODE, true)
      result = this.barcodeReader.decode(source, pureHints)
    } catch (re/*ReaderException*/) {
      // continue
    }

    if (result === null) {
      result = this.barcodeReader.decode(source, hints)
    }

    if (this.expectedFormat !== result.getBarcodeFormat()) {
      console.warn(`Format mismatch: expected '${this.expectedFormat}' but got '${result.getBarcodeFormat()}'${suffix}`)
      return false
    }

    const resultText: string = result.getText()
    // WORKAROUND: ignore new line diferences between systems
    // TODO: check if a real problem or only because test result is stored in a file with modified new line chars
    const expectedTextR = expectedText.replace(/\r\n/g, '\n')
    const resultTextR = resultText.replace(/\r\n/g, '\n')
    if (expectedTextR !== resultTextR) {
      const expectedTextHexCodes = AbstractBlackBoxTestCase.toDebugHexStringCodes(expectedTextR)
      const resultTextHexCodes = AbstractBlackBoxTestCase.toDebugHexStringCodes(resultTextR)
      console.warn(`Content mismatch: expected '${expectedTextR}' (${expectedTextHexCodes}) but got '${resultTextR}'${suffix} (${resultTextHexCodes})`)
      return false
    }

    const resultMetadata: Map<ResultMetadataType, any> = result.getResultMetadata()
    if (null !== expectedMetadata && undefined !== expectedMetadata) {
      for (let key in expectedMetadata.keys()) {
        //const key: ResultMetadataType = ResultMetadataType.valueOf(metadatum.)
        const expectedValue: Object = expectedMetadata.get(key)
        const keyType: ResultMetadataType = AbstractBlackBoxTestCase.valueOfResultMetadataTypeFromString(key)
        const actualValue: Object = resultMetadata === null ? undefined : resultMetadata.get(keyType)
        if (expectedValue !== actualValue) {
          console.warn(`Metadata mismatch for key '${key}': expected '${expectedValue}' but got '${actualValue}'`)
          return false
        }
      }
    }

    return true
  }

  private static toDebugHexStringCodes(text: string): string {
    let r = ""
    for(let i = 0, length = text.length; i != length; i++) {
      if (i > 0) r += ', '
      r += '0x' + text.charCodeAt(i).toString(16).toUpperCase()
    }
    return r
  }

  private static valueOfResultMetadataTypeFromString(value: string) {
    switch(value) {
      case 'OTHER': return ResultMetadataType.OTHER
      case 'ORIENTATION': return ResultMetadataType.ORIENTATION
      case 'BYTE_SEGMENTS': return ResultMetadataType.BYTE_SEGMENTS
      case 'ERROR_CORRECTION_LEVEL': return ResultMetadataType.ERROR_CORRECTION_LEVEL
      case 'ISSUE_NUMBER': return ResultMetadataType.ISSUE_NUMBER
      case 'SUGGESTED_PRICE': return ResultMetadataType.SUGGESTED_PRICE
      case 'POSSIBLE_COUNTRY': return ResultMetadataType.POSSIBLE_COUNTRY
      case 'UPC_EAN_EXTENSION': return ResultMetadataType.UPC_EAN_EXTENSION
      case 'PDF417_EXTRA_METADATA': return ResultMetadataType.PDF417_EXTRA_METADATA
      case 'STRUCTURED_APPEND_SEQUENCE': return ResultMetadataType.STRUCTURED_APPEND_SEQUENCE
      case 'STRUCTURED_APPEND_PARITY': return ResultMetadataType.STRUCTURED_APPEND_PARITY
      default: throw value + ' not a ResultMetadataType'
    }
  }

  protected static readTextFileAsString(file: string): string /*throws IOException*/ {
    const stringContents: string = fs.readFileSync(file, {encoding: "utf8"})
    if (stringContents.endsWith("\n")) {
      console.warn("contents: string of file " + file + " end with a newline. " +
                  "This may not be intended and cause a test failure")
    }
    return stringContents
  }

  protected static readBinFileAsString(file: string): string /*throws IOException*/ {
    const bufferContents: Buffer = fs.readFileSync(file)
    const stringContents = StringEncoding.decode(new Uint8Array(bufferContents), "iso-8859-1")
    if (stringContents.endsWith("\n")) {
      console.warn("contents: string of file " + file + " end with a newline. " +
                  "This may not be intended and cause a test failure")
    }
    return stringContents
  }

  protected static readTextFileAsMetadata(file: string): Map<string, string> /*throws IOException*/ {
    // TODO: 
    return null
  }

}

export default AbstractBlackBoxTestCase