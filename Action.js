import * as core from "@actions/core"
import * as github from "@actions/github"
import * as artifact from "@actions/artifact"
import * as os from "os"
import * as FileSystem from "fs/promises"
import * as Path from "path"
import { spawn } from "child_process";
import { exec } from "child_process";
//import * as Url from "url"

//	no __dirname or __filename in module-js node
//const __dirname = Url.fileURLToPath(new URL('.', import.meta.url));

import { GetParam } from './Params.js'

import { Build } from './Build.js'


async function RunAction()
{
	//	build project
	const ProjectPath = GetParam('Project');
	const Scheme = GetParam('Scheme');
	const Destination = GetParam('Destination');
	const Sdk = GetParam('Sdk');
	const Configuration = GetParam('Configuration');
	const BuildProductDir = GetParam('BuildProductDir');
	const AdditionalParams = GetParam('AdditionalParams',null);
	
	const BuildResults = await Build( ProjectPath, Scheme, Destination, Sdk, Configuration, BuildProductDir, AdditionalParams );
	throw `output build results`;
}


function OnRunFailed(Error)
{
	console.error(`Action Failed: ${Error}`);
	core.setFailed(`${Error}`) 
}

//  if this throws, set a github action error
RunAction().catch(OnRunFailed);
