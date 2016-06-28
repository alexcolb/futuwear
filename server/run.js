const UI_PORT = 8080	// Port to serve HTML UI on
const SOCKET_SERVER = "http://futuwear.tunk.org:13337/"; // Where to listen to Vör messages

// Dependencies
const http = require("http")
const fs = require("fs")
const express = require('express');
const socketIO = require('socket.io-client');
const mysql = require('mysql');

var app = express();

// Serve all static files
app.use(express.static('public'));

// Request parsers
var bodyParser = require('body-parser')
app.use(bodyParser.json());       	// to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
})); 

function isJSON(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

/* Method to get old data with */
app.get('/fetch', function (req, res) {
	
	var content = req.query.data // TODO: Safety
		
	console.log("Got fetched: " + content)
	content = JSON.parse(content)
	console.log("Accessing archives from TS " + content["time0"] + " to " + content["timeT"])
	
	getData(parseInt(content.time0), parseInt(content.timeT), res)
});


app.listen(UI_PORT, function () {
	console.log('Serving on port ' + UI_PORT.toString());
});

var lastMessage = {}


///////////////////////////
// Connect to Vör socket //
///////////////////////////


const client = socketIO.connect(SOCKET_SERVER);
client.on('connect', () => console.log(`Connected to Vör socket ${SOCKET_SERVER}`));
client.on('disconnect', () => console.log(`Client socket disconnected ${SOCKET_SERVER} :  ${new Date()}`));
client.on('reconnect_attempt', error => console.error(`Error - cannot connect to ${SOCKET_SERVER} : ${error} : ${new Date()}`));
client.on('error', error => console.error(`Error - socket connection: ${error} : ${new Date()}`));

client.on('message', msg => {
	
	console.log(`Message from vör: ${JSON.stringify(lastMessage)}`)
	
	var sensors = msg["sensors"]
	if (!sensors[0]) {
		sensors = [sensors]
	}
	for (var i = 0; i < sensors.length; i++) {
		var sensor = sensors[i]
		
		if (!isAlphaNumeric(sensor["name"]) || isNaN(sensor["value"])) 
			continue
		
		if (!saveData(sensor["name"], parseInt(sensor["value"])))
			registerSensor(sensor["name"], "Auto-added Sensor") 
	}
});


/////////////////////////
// Manage the database //
/////////////////////////

// from http://stackoverflow.com/questions/4434076/best-way-to-alphanumeric-check-in-javascript
function isAlphaNumeric(str) {
  var code, i, len;

  for (i = 0, len = str.length; i < len; i++) {
    code = str.charCodeAt(i);
    if (!(code > 47 && code < 58) && // numeric (0-9)
        !(code > 64 && code < 91) && // upper alpha (A-Z)
        !(code > 96 && code < 123)) { // lower alpha (a-z)
      return false;
    }
  }
  return true;
};

const c = mysql.createConnection({
	host     : 'localhost',
	user     : 'root',
	password : 'jalla',
	database : 'futuwear',
});
c.connect(function(err){
	if(err){
		console.log('Error connecting to Db: ' + err.message);
		return;
	}
	console.log('Database connection established');
});

function getData(time0, timeT, responder) {
	var sql = 'SELECT sensorID, UNIX_TIMESTAMP(logged) AS logged, val FROM Data WHERE logged >= FROM_UNIXTIME('+time0+') AND logged <= FROM_UNIXTIME('+timeT+') LIMIT 100;'
	c.query(sql, function(err, result) {
		responder.setHeader('Content-Type', 'application/json');
		if (!err) {
			console.log("Found " + result.length + " matching entries.")
			responder.send(JSON.stringify(result, null, 3));	
		}
		else  {
			console.log("Mysql error: " + JSON.stringify(err))
			responder.send(JSON.stringify({}, null, 3));
		}
	});	
}

/* Saves a given value as reported by #sensorID */
function saveData(sensorID, val) {
	c.query('SELECT Count(ID) AS results FROM Sensors WHERE ID="' + sensorID + '";', function(err, result) {
		if (!err && result[0]["results"]) {
			var found = !isNaN(result[0]["results"]) && parseInt(result[0]["results"]) > 0
			
			if (found) {
				c.query('INSERT INTO Data(SensorID, val) VALUES ("'+sensorID+'", "'+val+'");', function(err, result) {
					if (!err) {
						console.log("Saved data!")
						return true
					}
					else  {
						console.log("Mysql error: " + JSON.stringify(err))
					}
				});
			}
			else console.log("Sensor #" + sensorID + " is unknown; its data was ignored.")
		}
		else  {
			console.log("Mysql error: " + JSON.stringify(err))
		}
	});
	return false
}

/* Registers a new sensor into the system */
function registerSensor(ID, name) {
	c.query('SELECT Count(ID) AS results FROM Sensors WHERE ID="' + ID + '";', function(err, result) {
		if (!err) {
			var found = !isNaN(result[0]["results"]) && parseInt(result[0]["results"]) > 0
			
			if (!found) {
				c.query('INSERT INTO Sensors(ID, type, name) VALUES ("'+ID+'", "kinetic", "Test-sensor");', function(err, result) {
					if (!err) {
						console.log("Saved new sensor!")
					}
					else  {
						console.log("Mysql sensor insertion error: " + JSON.stringify(err))
					}
				});
			}
			else console.log("Sensor #" + ID + " already exists, please give a fresh id.")
		}
		else  {
			console.log("Mysql error: " + JSON.stringify(err))
		}
	});
}




