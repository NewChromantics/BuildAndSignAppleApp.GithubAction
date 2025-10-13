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
import { ZipProduct, NotarizeAndStapleApp }  from './Signing.js'

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
	const ForceNotarizeProduct = GetParam('NotarizeProduct',null);	//	null so we can explicitly check for true/false
	
	const BuildResultMeta = await Build( ProjectPath, Scheme, Destination, Sdk, Configuration, AdditionalParams, Clean, RewritePackageUrls );
	console.log(`Listing built output directory(${BuildResultMeta.ProductDirectory})...`);
	await Exec("ls -l", [BuildResultMeta.ProductDirectory] );

	//	output original build meta
	console.log(`Build ProductName=${BuildResultMeta.ProductFilename}`);
	core.setOutput('BuildProductName', BuildResultMeta.ProductFilename );

	console.log(`Build ProductDirectory=${BuildResultMeta.ProductDirectory}`);
	core.setOutput('BuildProductDirectory', BuildResultMeta.ProductDirectory );
	
	//	notarize if user provided
	const NotarizeAppleId = GetParam('NotarizeAppleId',false);
	let Notarize = (NotarizeAppleId && NotarizeAppleId.length>0);
	//	but can also override this
	if ( ForceNotarizeProduct === true || ForceNotarizeProduct === false )
		Notarize = ForceNotarizeProduct;

	if ( Notarize )
	{
		console.log(`Notarizing with ${NotarizeAppleId}`);
		const NotarizePassword = GetParam('NotarizeAppSpecificPassword',false);
		if ( !NotarizePassword )
			throw `To notarize with NotarizeAppleId need to provide NotarizeAppSpecificPassword`;
		const TeamIdentifier = GetParam('TeamIdentifier',false);
		if ( !TeamIdentifier )
			throw `To notarize with NotarizeAppleId need to provide TeamIdentifier`;
		
		//	notarize app in-place
		await NotarizeAndStapleApp(BuildResultMeta.ProductDirectory, BuildResultMeta.ProductFilename, TeamIdentifier, NotarizeAppleId,NotarizePassword);
	}
		
	

	let OutputMeta = BuildResultMeta;
	
	const DoZipProduct = GetParam('ZipProduct',false);
	if ( DoZipProduct )
	{
		OutputMeta = await ZipProduct( BuildResultMeta.ProductDirectory, BuildResultMeta.ProductFilename );
	}
	
	console.log(`Listing output directory(${OutputMeta.ProductDirectory})...`);
	await Exec("ls -l", [OutputMeta.ProductDirectory] );

	//	output product name explicitly without (last) extension so it can be used to avoid .zip.zip in github workflow artifacts
	const ProductName = PopLastFilenameExtension(OutputMeta.ProductFilename);
	console.log(`Output ProductName=${ProductName}`);
	core.setOutput('ProductName', ProductName );
	
	console.log(`Output ProductFilename=${OutputMeta.ProductFilename}`);
	core.setOutput('ProductFileName', OutputMeta.ProductFilename );

	console.log(`Output ProductDirectory=${OutputMeta.ProductDirectory}`);
	core.setOutput('ProductDirectory', OutputMeta.ProductDirectory );
	
	console.log(`Build action finished.`)
}


//	if the filename has at least one extension, remove it
//	hello.app.zip -> hello.app
//	hello.app -> hello
//	hello -> hello
function PopLastFilenameExtension(Filename)
{
	const Parts = Filename.split('.');
	if ( Parts.length <= 1 )
		return Filename;
	const Popped = Parts.pop();
	const ShorterFilename = Parts.join('.');
	return ShorterFilename;
}

function OnRunFailed(Error)
{
	console.error(`Action Failed: ${Error}`);
	core.setFailed(`${Error}`) 
}

//  if this throws, set a github action error
RunAction().catch(OnRunFailed);


