// Test-only tripwire; the pilot never imports this module.
import {syncBuiltinESMExports} from 'node:module';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import dgram from 'node:dgram';
import child from 'node:child_process';
const denied=()=>{throw Error('OFFLINE_BOUNDARY_VIOLATION');};
for(const [module,names] of [[net,['connect','createConnection','createServer']],[tls,['connect','createServer']],[http,['request','get','createServer']],[https,['request','get','createServer']],[dns,['lookup','resolve']],[dgram,['createSocket']],[child,['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']]])for(const name of names)module[name]=denied;
globalThis.fetch=denied;
syncBuiltinESMExports();
