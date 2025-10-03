import * as core from "@actions/core"
import * as github from "@actions/github"
import * as artifact from "@actions/artifact"
import * as os from "os"
import * as FileSystem from "fs/promises"
import * as Path from "path"
import { spawn } from "child_process";
import { GetParam } from './Params.js'
import { Build } from './Build.js'
import { Exec } from "./Execute.js";


async function RunAction()
{
	//	build project
	const ProjectPath = GetParam('ProjectPath',null);
	const Scheme = GetParam('Scheme');
	const Destination = GetParam('Destination');
	const Sdk = GetParam('Sdk',null);
	const Configuration = GetParam('Configuration');
	const AdditionalParams = GetParam('AdditionalParams',null);
	const RewritePackageUrls = GetParam('RewritePackageUrls',null);
	const Clean = GetParam('Clean',false);
	
	const BuildResultMeta = await Build( ProjectPath, Scheme, Destination, Sdk, Configuration, AdditionalParams, Clean, RewritePackageUrls );

	console.log(`Listing output directory(${BuildResultMeta.ProductDirectory})...`);
	await Exec("ls -l", [BuildResultMeta.ProductDirectory] );

	
	console.log(`Build Output ProductName=${BuildResultMeta.ProductFilename}`);
	core.setOutput('ProductName', BuildResultMeta.ProductFilename );

	console.log(`Build Output ProductDirectory=${BuildResultMeta.ProductDirectory}`);
	core.setOutput('ProductDirectory', BuildResultMeta.ProductDirectory );
	
	console.log(`Build action finished.`)
}


function OnRunFailed(Error)
{
	console.error(`Action Failed: ${Error}`);
	core.setFailed(`${Error}`) 
}

//  if this throws, set a github action error
RunAction().catch(OnRunFailed);
