var eventstore = require('eventstore');

const appName = "example-app"
const config = require("taxman-cqrs/configDynamo")(appName);
var es = eventstore(config.eventStoreConf);

es.on('connect', function() {
  var skip = 0, limit = 4; // if you omit limit or you define it as -1 it will retrieve until the end
  let numberOfEventsProcessed = 0;

  const processStreamEvents = (err, streamEvents) => {
    streamEvents.forEach(streamEvent => {
      numberOfEventsProcessed++

      const event = streamEvent.payload;

      if (event.name === "accountOpened") {
        console.log(`
          INSERT INTO ACCOUNTS (id, owner, balance, revision) 
          VALUES (
            '${event.aggregate.id}', 
            '${event.payload.owner}', 
            ${event.payload.initialBalance}, 
            ${event.aggregate.revision}
          )`
        )
      } else if (event.name === "moneyWithdrawn") {
        console.log(`
          UPDATE ACCOUNTS SET 
            balance = balance - ${event.payload.amount}, 
            revision = ${event.aggregate.revision} 
          WHERE id = '${event.aggregate.id}'`
        )
      } else if (event.name === "moneyDeposited") {
        console.log(`
          UPDATE ACCOUNTS SET 
            balance = balance + ${event.payload.amount}, 
            revision = ${event.aggregate.revision} 
          WHERE id = '${event.aggregate.id}'`
        )
      }
    });

    if (streamEvents.length === limit) {
      streamEvents.next(processStreamEvents); // just call next to retrieve the next page...
    } else {
      //console.log("finished")
      console.log("WRITING TO LOG, number of events processed: " + numberOfEventsProcessed)
    }
  }
  es.getEvents(skip, limit, processStreamEvents);

  //Streaming API is not supported by DynamoDB
  /*
  var stream = es.streamEvents(skip, limit);
  stream.on('data', function(e) {
    console.log(">>> ", e)
  });
  stream.on('end', function() {
    console.log('no more events');
  });
  */
});

es.on('disconnect', function() {
  console.log('connection to storage is gone');
});

es.init(function (err) {});