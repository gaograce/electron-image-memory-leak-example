const resolve = require('dns').resolve
const resolveObject = require('url').resolveObject

var net = require('net');

function getFreePortAsync(fn) {
  var server = net.createServer();
  var calledFn = false;

  server.on('error', function(err) {
    server.close();

    if (!calledFn) {
      calledFn = true;
      fn(err);
    }
  });

  server.listen(0, function() {
    var port = server.address().port;

    server.close();

    if (!calledFn) {
      calledFn = true;

      if (!port) {
        fn(new Error('Unable to get the server\'s given port'));
      } else {
        fn(null, port);
      }
    }
  });
}

async function getFreePort(){
    let promise = new Promise(async (resolve, reject)=>{
        getFreePortAsync(function(err, port){
            if(err){
                reject(err);
            }else{
                resolve(port);
            }
        })
    });
    let port = await promise;
    return port;
}

module.exports = {
  getFreePort: getFreePort
}