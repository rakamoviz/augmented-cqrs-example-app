const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const _ = require("lodash");
const redis = require("redis");

const app = express();
const port = 3000;
const appName = "example-app";
const contextName = "routemanagement";

const corsOptions = {
  origin: process.env.HTTP_ACCESS_CONTROL_ALLOW_ORIGIN,
  credentials: true,
  preflightContinue: true,
  exposedHeaders: ["X-current-user-id", "x-page-count", "x-page-limit"]
}

app.options("*", cors);
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());

const config = require("augmented-cqrs/configDynamo")(appName, contextName);

const globalErrorHandler = function(err, ...args) {
  console.error("globalErrorHandler: ", err, " : args ", args);
  process.exit(1);
}

function createDomainMsgbus() {
  const cmdChannel = require("augmented-cqrs/inprocChannel")(require("uuid/v4")());
  const evtChannel = require("augmented-cqrs/inprocChannel")(require("uuid/v4")());

  const msgbusCorePromise = require("augmented-cqrs/msgbusCore")(
    globalErrorHandler, {
      cmdChannel, evtChannel
    }
  );

  return msgbusCorePromise.then(msgbusCore => {
    return require("augmented-cqrs/msgbus")(`${appName}.${contextName}`, msgbusCore);
  }).catch(err => {
    process.exit(1)
  });
}

//external context
/*
function createSaleMsgbus() {
  //const cmdChannel = require("augmented-cqrs/redisChannel")(redisConfig);
  const cmdChannel = require("augmented-cqrs/inprocChannel")(require("uuid/v4")()); 
    //null, since in this example we are not going to send any command 
                           //back to the sale context
  //const evtChannel = require("augmented-cqrs/eventstoreChannel")();
  const evtChannel = require("augmented-cqrs/inprocChannel")(require("uuid/v4")()); //redisChannel because
  //we will be receiving it from 

  const msgbusCorePromise = require("augmented-cqrs/msgbusCore")(
    globalErrorHandler, {
      cmdChannel, evtChannel
    }
  );

  return msgbusCorePromise.then(msgbusCore => {
    return require("augmented-cqrs/msgbus")(`${appName}.sale`, msgbusCore);
  }).catch(err => {
    process.exit(1)
  });
}
*/

//example of integration with external context by pulling from event-store of external context
function createSaleMsgbus() {
  const cmdChannel = null;
  const evtChannel = require("augmented-cqrs/inprocChannel")(require("uuid/v4")());
  const msgbusCorePromise = require("augmented-cqrs/msgbusCore")(
    globalErrorHandler, {
      cmdChannel, evtChannel
    }
  );

  return new Promise((resolve, reject) => {
    const saleEventStoreConf = {
      host: 'localhost', 
      port: 6379,
      db: 0,
      timeout: 10000,
      prefix: `${appName}-${contextName}-ext-sale:`
    }
    const redisClient = redis.createClient(saleEventStoreConf);

    setTimeout(() => {
      if (redisClient.ping() === false) {
        reject(new Error("Cannot connect to redis " + JSON.stringify(saleEventStoreConf)));
      }

      redisClient.on("error", (err) => {
        console.log("ERROR IN REDIS " + JSON.stringify(saleEventStoreConf));
        process.exit(1);
      });
    
      resolve(redisClient);
    }, 1000);
  }).then(redisClient => {
    return msgbusCorePromise.then(msgbusCore => {
      const msgbus = require("augmented-cqrs/msgbus")(`${appName}.sale`, msgbusCore);
      const saleEventStoreConf = {
        type: 'dynamodb',
        eventsTableName: `${appName}-sale-events`,                  // optional
        EventsReadCapacityUnits: 1,                 // optional
        EventsWriteCapacityUnits: 3,                // optional
        SnapshotReadCapacityUnits: 1,               // optional
        SnapshotWriteCapacityUnits: 3,              // optional
        UndispatchedEventsReadCapacityUnits: 1,     // optional
        UndispatchedEventsReadCapacityUnits: 1,     // optional
        useUndispatchedEventsTable: true,            // optional
        eventsTableStreamEnabled: true,             // optional
        eventsTableStreamViewType: 'NEW_IMAGE'      // optional
      }

      return new Promise((resolve, reject) => {
        redisClient.get("LAST_INDEX", (err, lastIndex) => {
          if (err) {
            reject(err);
          } else {
            resolve(lastIndex ? parseInt(lastIndex) : 0);
          }
        });
      }).then(lastIndex => {
        return require("augmented-cqrs/eventstoreMsgbus")(
          msgbus, saleEventStoreConf, lastIndex, 4, 10000, 
        (lastIndex) => {
          redisClient.set("LAST_INDEX", lastIndex);
        }, (err, args) => 
        {
          console.log("domainEventEmittingCallback ", err, ":", args)
        });
      });
    });
  }).catch(err => {
    console.log(err)
    process.exit(1)
  });
}

function startProcessManagerLoop(processManager) {
  setInterval(() => {
    console.log("======================================")
    processManager.getTimeoutedSagas(function (err, sagas) {
      if (err) { return console.log('ohh!'); }

      console.log("SAGAS ARE ", sagas)
    
      sagas.forEach(function (saga) {
        // saga.id...
        // saga.getTimeoutAt();
        var cmds = saga.getTimeoutCommands();

        console.log("CMDS ARE ", cmds)

        if (cmds != undefined) {
          cmds.forEach(function (cmd) {
            saga.addCommandToSend(cmd);
          });
        }

        saga.removeTimeout();
        saga.commit(function (err) {
          console.log("******** ", err)
        });
    
        // or if saga does not clean itself after timouted and/or no commands are defined, then:
        // pm.removeSaga(saga || saga.id, function (err) {});
        // or
        // saga.destroy();
        // saga.commit(function (err) {});
      });
    });
  }, 1.5 * 1000 * 60);
}

//const 
/** 
 * saleMsgbus is to simulate events from other context
*/
Promise.all([createDomainMsgbus(), createSaleMsgbus()]).then(([domainMsgbus, saleMsgbus]) => {
  const msgbusMap = {
    "sale": saleMsgbus,
    [contextName]: domainMsgbus
  }

  const domainPromise = require("augmented-cqrs-example-domain")(
    config, msgbusMap[contextName], globalErrorHandler, 
    {
      commandHandlingCallback: (err, args) => {
        console.log("domainCommandHandlingCallback ", err, ":", args);
      }, 
      eventEmittingCallback: (err, args) => {
        console.log("domainEventEmittingCallback ", err, ":", args)
      }
    }
  );

  const routingMsgbus = require("augmented-cqrs/routingMsgbus")(msgbusMap);
  const processManagerPromise = require("augmented-cqrs-example-saga")(
    config, routingMsgbus, globalErrorHandler, 
    {
      eventHandlingCallback: (err, args) => {
        console.log("sagaEventHandlingCallback ", err, ":", args)
      }, 
      commandEmittingCallback: (err, args) => {
        console.log("sagaCommandEmittingCallback ", err, ":", args)
      }, 
      eventMissingHandler: (info, evt) => {
        console.log("eventMissingHandler ", info, ":", evt);
      }
    }
  );

  return Promise.all([domainPromise, processManagerPromise]).then(([domain, processManager]) => {
    console.log("domain ready: ", domain);
    console.log("processManager ready: ", processManager);

    startProcessManagerLoop(processManager);
    return routingMsgbus;
  });
}).then(routingMsgbus => {
  app.get('/', (req, res) => res.send('Hello World!'));

  const messageDispatcher = require("augmented-cqrs/messageDispatcher")();
  const requestErrorHandler = (req, res, err) => {
    if (err) {
      res.status(500).json({error: err});
    } else {
      res.status(200).json({ok: true});
    }
  }

  const requestResponseHandler = (req, res, responses, done) => {
    done();
    res.status(200).json(responses);
  }

  const handleCommandOrEvent = (type, req, res) => {
    if (req.query.async === "true") {
      messageDispatcher.dispatch(type, routingMsgbus, req.body, {
        errorHandler: (err) => requestErrorHandler(req, res, err)
      });
    } else {
      const debouncedRequestResponseHandler = _.debounce((responses, done) => {
        requestResponseHandler(req, res, responses, done);
      }, 3000);

      const responses = [];
      messageDispatcher.dispatch(type, routingMsgbus, req.body, {
        errorHandler: (err) => requestErrorHandler(req, res, err),
        responseHandler: (response, done) => {
          responses.push(response);
          debouncedRequestResponseHandler(responses, done);
        }
      });
    }
  }

  app.post('/events', (req, res) => {
    console.log("POST events ", req.body, req.query)
    handleCommandOrEvent("evt", req, res);
  });

  app.post('/commands', (req, res) => {
    console.log("POST commands ", req.body, req.query)
    handleCommandOrEvent("cmd", req, res);
  });

  app.listen(port, () => console.log(`Example app listening on port ${port}!`));
});