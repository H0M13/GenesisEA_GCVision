const { Requester } = require("@chainlink/external-adapter");
const vision = require("@google-cloud/vision");
const Stream = require("stream").Transform;

const isNonSsl =
  process.env.IPFS_GATEWAY_SSL &&
  process.env.IPFS_GATEWAY_SSL.toLowerCase() === "false";
const httpProtocol = isNonSsl ? require("http") : require("https");

const createRequest = async (input, callback) => {
  const visionClient = new vision.ImageAnnotatorClient({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    keyFilename: process.env.GOOGLE_CLOUD_KEY_FILENAME
  });

  return performRequest({
    input,
    callback,
    visionClient
  });
};

const performRequest = ({ input, callback, visionClient }) => {
  const { data, id: jobRunID } = input;

  if (!data) {
    callback(500, Requester.errored(jobRunID, "No data"));
    return;
  }

  const { hash } = data;

  if (jobRunID === undefined) {
    callback(500, Requester.errored(jobRunID, "Job run ID required"));
    return;
  }

  if (hash === undefined) {
    callback(500, Requester.errored(jobRunID, "Content hash required"));
  } else {
    const protocol = isNonSsl ? "http" : "https";
    const url = `${protocol}://${process.env.IPFS_GATEWAY_URL}/ipfs/${hash}`;

    try {
      httpProtocol
        .request(url, function(response) {
          var imgBytesStream = new Stream();

          response.on("data", function(chunk) {
            imgBytesStream.push(chunk);
          });

          response.on("end", function() {
            requestSafeSearchLabels(imgBytesStream.read());
          });
        })
        .end();

      const requestSafeSearchLabels = async imgBytes => {
        try {
          const [result] = await visionClient.safeSearchDetection(imgBytes);

          const detections = result.safeSearchAnnotation;

          const { adult, violence, racy } = detections;

          const response = {
            data: {
              adult,
              violence,
              racy
            }
          };

          const likelihoodToConfidenceMapping = {
            UNKNOWN: "",
            VERY_UNLIKELY: "0",
            UNLIKELY: "20",
            POSSIBLE: "50",
            LIKELY: "80",
            VERY_LIKELY: "100"
          };

          response.data.result = [
            likelihoodToConfidenceMapping[adult],
            likelihoodToConfidenceMapping[racy],
            likelihoodToConfidenceMapping[violence],
            "",
            ""
          ].join(",");

          callback(200, Requester.success(jobRunID, response));
        } catch (error) {
          console.error(error);
          callback(500, Requester.errored(jobRunID, error));
        }
      };
    } catch (error) {
      console.error(error);
      callback(500, Requester.errored(jobRunID, error));
    }
  }
};

// This is a wrapper to allow the function to work with
// GCP Functions
exports.gcpservice = (req, res) => {
  createRequest(req.body, (statusCode, data) => {
    res.status(statusCode).send(data);
  });
};

// This is a wrapper to allow the function to work with
// AWS Lambda
exports.handler = (event, context, callback) => {
  createRequest(event, (statusCode, data) => {
    callback(null, data);
  });
};

// This is a wrapper to allow the function to work with
// newer AWS Lambda implementations
exports.handlerv2 = (event, context, callback) => {
  createRequest(JSON.parse(event.body), (statusCode, data) => {
    callback(null, {
      statusCode: statusCode,
      body: JSON.stringify(data),
      isBase64Encoded: false
    });
  });
};

// This allows the function to be exported for testing
// or for running in express
module.exports.createRequest = createRequest;
module.exports.performRequest = performRequest;
