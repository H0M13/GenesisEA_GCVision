const assert = require("chai").assert;
const performRequest = require("../index.js").performRequest;
const sinon = require("sinon");
require("dotenv").config();
const vision = require("@google-cloud/vision");

const createVisionStub = () =>
  sinon.createStubInstance(vision.ImageAnnotatorClient, {
    safeSearchDetection: sinon.stub().returns([
      {
        safeSearchAnnotation: {
          adult: "VERY_LIKELY",
          racy: "UNLIKELY",
          medical: "UNLIKELY",
          spoof: "UNLIKELY",
          violence: "UNLIKELY"
        }
      }
    ])
  });

describe("performRequest", () => {
  const jobID = "1";

  context("successful calls", () => {
    const requests = [
      {
        name: "standard",
        testData: {
          id: jobID,
          data: { hash: "QmWATWQ7fVPP2EFGu71UkfnqhYXDYH566qy47CnJDgvs8u" }
        }
      }
    ];

    requests.forEach(req => {
      it(`${req.name}`, done => {

        var visionStub = createVisionStub();

        performRequest({
          input: req.testData,
          callback: (statusCode, data) => {
            assert.equal(statusCode, 200);
            assert.equal(data.jobRunID, jobID);
            assert.isNotEmpty(data.data);
            done();
          },
          visionClient: visionStub
        });
      });
    });
  });

  context("error calls", () => {
    const requests = [
      { name: "empty body", testData: {} },
      { name: "empty data", testData: { data: {} } }
    ];

    requests.forEach(req => {
      it(`${req.name}`, done => {
        performRequest({
          input: req.testData,
          callback: (statusCode, data) => {
            assert.equal(statusCode, 500);
            assert.equal(data.jobRunID, jobID);
            assert.equal(data.status, "errored");
            assert.isNotEmpty(data.error);
            done();
          }
        });
      });
    });
  });
});
