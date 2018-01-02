var adb = require("adbkit");
var freePort = require('./freePort')
var net  = require('net')
var BannerParser = require('minicap').BannerParser
var DIR = "/data/local/tmp/mydata";
var _ = require('lodash')
function readFrameLength(buffer){
    let arr = buffer.slice(0, 4);
    return arr[3] << 24 | 
           arr[2] << 16 | 
           arr[1] << 8  | 
           arr[0] << 0  ;
}
function getDeviceSize(id) {
    let cli = adb.createClient();
    return new Promise(async(resolve, reject) => {
      let res = await cli.shell(id, "wm size");
      res.on("data", chunk => {
        let s = chunk.toString();
        if (s.startsWith("Physical size")) {
          let ps = s.split("\n")[0];
          if(s.indexOf('Override size') > -1){
            ps = s.split("\n")[1];
          }  
          let wh = ps.split(":")[1];
          let v = wh.trim().split("x");
          resolve({
            width: parseInt(v[0]),
            height: parseInt(v[1])
          })
        }
      });
    });
  }
  function parseMiniCap( cb ){
    if( banner === null && buffer.length >= 24 ){
        let chunk = [];
        for(let i=0;i<24;i++){
            chunk.push( buffer.shift() );
        }
        let parser = new BannerParser();
        parser.parse(chunk);
        banner = parser.take();
    }else {
        while( buffer.length > 4  ){
            let l = readFrameLength( buffer );
            if( buffer.length >= l + 4 ){
                let chunk   = buffer.slice( 4, 4+l );
                buffer = buffer.slice( 4+l );
                cb( chunk );
            }else{
                break;
            }
        }
    }
}
async function startMiniCapService( id, bin, rotation){
    let cli = adb.createClient();
    currentRotation = rotation;
    return new Promise( async (resolve , reject) => {
        let size = await getDeviceSize(id);
        let sizeStr = `${size.width}x${size.height}`;
        let resolution = '480x850';
        let cmd = `LD_LIBRARY_PATH=${DIR} ${DIR}/${bin} -Q 45 -P ${sizeStr}@${resolution}/${rotation}`;
        let res = await cli.shell( id , cmd );
        let buffer = "";
        res.on("data" , chunk => {
            buffer = buffer + chunk.toString();
            
            if( buffer.indexOf("bytes for JPG encoder") !== -1  ){
                resolve();
            }
        });
    });
}
async function initMinicapForward( id , cb ){

    let cli = adb.createClient();
    minicapPort = await freePort.getFreePort();
    let port = minicapPort;
    let forwardRes = await cli.forward( id , "tcp:"+port , "localabstract:minicap" );
    
    buffer = [];
    banner = null;
    let client = net.createConnection({ port: port }, () => {
        console.log('minicap connected to server!');
        
    });
            
    client.on('data', (chunk) => {
        chunk.forEach( e => buffer.push(e) );
        parseMiniCap( cb );
    });
            
    client.on('end', () => {
        console.log('minicap disconnected from server');
    });
}
async function initMinicap( id , rotation, cb ) {
    let cli = adb.createClient();
    let prop = await cli.getProperties(id);

    let abi = prop["ro.product.cpu.abi"];
    let sdk = prop["ro.build.version.sdk"];

    let bin = 'minicap-nopie';
    if(sdk >= 16){
        bin = "minicap";
    }
    let pro1 = new Promise( async (resolve , reject) => {
        let minicap = `${__dirname}/minicap/${abi}/${bin}`;
        let transfer = await cli.push(id, minicap,`${DIR}/${bin}`, 0o777);
        transfer.on("progress" , stat => console.log( stat ) );
        transfer.on("end"   , stat => resolve() );
        transfer.on("error" , err  => reject(err) );
    })
        
    let pro2 = new Promise( async (resolve , reject) => {
        let minicapSoFile = `${__dirname}/minicap/so/android-${sdk}/${abi}/minicap.so`;
        let transfer = await cli.push(id, minicapSoFile , `${DIR}/minicap.so` , 0o777 );
        transfer.on("progress" , stat => console.log( stat ) );
        transfer.on("end"   , stat => resolve() );
        transfer.on("error" , err  => reject(err) );
    })

    await Promise.all([pro1,pro2]);
    await startMiniCapService( id , bin, rotation);
    await initMinicapForward( id , cb );           
}

async function trackDevices(devices, callback){
    let client  = adb.createClient();
    let devicesNow = await client.listDevices();
    for( let device of devicesNow ){
        devices.push( device );
    }

    let tracker = await client.trackDevices();
    tracker.on('add', async device => {
        let idx = _.findIndex( devices , e => e.id === device.id );
        if( idx < 0 ){
          devices.push( device ) ;
          console.log('Device ' + device.id + ' added.')
        }
    });
    tracker.on('remove',  device => {
        let idx = _.findIndex( devices , e => e.id === device.id );
        if( idx >= 0 ){
            devices.splice(idx, 1);
            console.log('Device ' + device.id + ' removed.')
        }
    });
    tracker.on('end', function() {
      console.log('Tracking stopped')
    })
  }

  module.exports = {
      trackDevices: trackDevices,
      initMinicap: initMinicap
  }
