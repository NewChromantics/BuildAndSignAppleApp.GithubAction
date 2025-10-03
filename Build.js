import * as FileSystem from "fs/promises"
import * as Path from "path"
import { Exec, PrintStdOut, PrintStdErr } from './Execute.js'


function SanitiseXcodeDestination(Destination)
{
	//	destination needs to be key=value
	//	generic/platform=iOS
	//	platform=macOS,arch=x86_64
	//	platform=iOS Simulator,name=iPhone 6,OS=9.1
	//	platform=macOS
	if ( !Destination.includes('=') )
		throw `Destination (${Destination}) expected to have at least one key=value`;
	
	//	todo: any sanitiasation (add/remove quotes etc)
	return Destination;
}

export class AppleBuildParams
{
	constructor(ProjectPath,Scheme,Destination,Sdk,Configuration,AdditionalParams)
	{
		Destination = SanitiseXcodeDestination(Destination);
		
		//	required (thus turn to string)
		this.Scheme = `${Scheme}`;
		this.Configuration = `${Configuration}`;
		this.Destination = `${Destination}`;
		
		//	optional
		this.ProjectPath = ProjectPath;
		this.Sdk = Sdk;

		this.AdditionalParams = [];
		if ( AdditionalParams )
		{
			this.AdditionalParams = AdditionalParams.split(' ');
		}
			
	}
	
	get description()
	{
		return `${this.Scheme}(${this.Destination})`;
	}
	
	GetXcodeArguments(IncludeDestination=true,IncludeConfiguration=true)
	{
		const Args = [];

		//	all optional
		if ( this.ProjectPath )
			Args.push(`-project`,this.ProjectPath);
		
		//	require these
		Args.push(`-scheme`, this.Scheme );

		if ( this.Sdk )
			Args.push(`-sdk`,this.Sdk);
		
		//  gr: removed
		//    `-workspace`, `${ProjectPath}/project.xcworkspace`,
		//  from these as it was erroring with an unknown error on xcode11/mojave (but okay on xcode10/high sierra)

		//	required for building but not other things
		if ( IncludeConfiguration )
			Args.push(`-configuration`, this.Configuration );
		
		if ( IncludeDestination )
			Args.push(`-destination`,this.Destination);
		
		Args.push( ...this.AdditionalParams );	

		return Args;
	}
	
	
}




async function PrintProjectSchemesAndConfigurations(ProjectPath)
{
	const ListOptions = [];
	if ( ProjectPath )
	{
		ListOptions.push(`-project`,ProjectPath);
	}
	ListOptions.push(`-list`);
	
	console.log(`Listing schemes & configurations...`);
	await Exec("xcodebuild", ListOptions, null, null, true );
}

//	returns array of matches
function MatchRegex(Lines,Pattern)
{
	if ( !Array.isArray(Lines) )
		throw `Lines for regex is not array (${typeof Lines})`;
	
	const regex = new RegExp(Pattern, 'g');
	let Matches = Lines.map( Line => regex.exec(Line.trim()) );
	Matches = Matches.filter( Match => Match!=null );
	Matches = Matches.map( Match => Match[1] );
	return Matches;
}

//	these are assuming line is trimmed
const BuildDirectorysPattern = `^BUILT_PRODUCTS_DIR ?= ?(.*)`;
const FullProductNamesPattern = `^FULL_PRODUCT_NAME ?= ?(.*)`;
const ScriptOutputsPattern = `^SCRIPT_OUTPUT_FILE_[0-9]+[ /\\/]?= ?(.*)`;

function GatherProjectMeta(StdOutLines,ProjectMeta={})
{
	const BuildDirectorys = MatchRegex(StdOutLines,BuildDirectorysPattern);
	const FullProductNames = MatchRegex(StdOutLines,FullProductNamesPattern);
	const ScriptOutputs = MatchRegex(StdOutLines,ScriptOutputsPattern);

	//	merge into existing data
	ProjectMeta.BuildDirectorys = (ProjectMeta.BuildDirectorys ?? []).concat( BuildDirectorys );
	ProjectMeta.FullProductNames = (ProjectMeta.FullProductNames ?? []).concat( FullProductNames );
	ProjectMeta.ScriptOutputs = (ProjectMeta.ScriptOutputs ?? []).concat( ScriptOutputs );

	return ProjectMeta;
}


//	returns
//	.BuildDirectorys
//	.FullProjectNmae
//	.ScriptOutput
async function GetProjectMeta(BuildParams)
{
	let ProjectMeta = {};
	
	function OnStdOut(Lines)
	{
		PrintStdOut(Lines);
		ProjectMeta = GatherProjectMeta(Lines,ProjectMeta);
	}
	
	const PreBuildOptions = BuildParams.GetXcodeArguments();
	PreBuildOptions.push(`-showBuildSettings`);

	console.log(`Listing build settings for ${BuildParams.description}...`);
	const ExecResult = await Exec(
				"xcodebuild",
				PreBuildOptions,
				OnStdOut,
								  null,
								  true
					);
	
	
	//	resolve meta
	console.log(JSON.stringify(ProjectMeta));
	if ( ProjectMeta.BuildDirectorys.length != 1 )
		throw `Build detected wrong amount of build-directories (expecting 1); ${JSON.stringify(ProjectMeta.BuildDirectorys.length)}`;
	
	if ( ProjectMeta.FullProductNames.length != 1 )
		throw `Build detected wrong amount of product-names (expecting 1); ${JSON.stringify(ProjectMeta.FullProductNames.length)}`;
	
	//	resolve path in case it incldues .. or ., or process-relative paths etc back to pure dir for github
	const BuildDirectory = Path.normalize(ProjectMeta.BuildDirectorys[0]);
	
	const OutputMeta = {};
	OutputMeta.ProductDirectory = BuildDirectory; 
	OutputMeta.ProductFilename = ProjectMeta.FullProductNames[0]; 
	return OutputMeta;
}

async function BuildProject(BuildParams)
{
	const BuildOptions = BuildParams.GetXcodeArguments();
		
	console.log(`---------Building product...`);
	const UseSpawn = true;
	await Exec(
			   "xcodebuild",
			   BuildOptions,
			   null,
			   null,
			   UseSpawn
			   );
	
	console.log(`---------XCodeBuild product build successfull.`);
	
	//	we don't output meta here, as the build results don't include what we need
	//	need to have gotten that from GetProjectMeta.
}

async function CleanProject(BuildParams)
{
	const BuildOptions = BuildParams.GetXcodeArguments();
	BuildOptions.push('clean');
	
	console.log(`---------Cleaning product...`);
	const UseSpawn = true;
	await Exec(
			   "xcodebuild",
			   BuildOptions,
			   null,
			   null,
			   UseSpawn
			   );
	
	console.log(`---------XCodeBuild product clean successfull.`);
}


async function ResolveProjectPath(ProjectPath)
{
	//	gotta find project filename
	if ( !ProjectPath )
	{
		throw `todo: if no ProjectPath provided, need to manually resolve the filename`;
	}
	
	//	already ends with .xcodeproj, lets assume it's good
	if ( ProjectPath.endsWith('.xcodeproj') )
		return ProjectPath;

	ProjectPath += '.xcodeproj';
	return ProjectPath;
}

async function RewritePackageUrlInPbxProj(ProjectPath,RewriteMap)
{
	ProjectPath = await ResolveProjectPath(ProjectPath);
	const PbxPath = `${ProjectPath}/project.pbxproj`;

	let Pbx = await FileSystem.readFile(PbxPath);
	Pbx = Pbx.toString();
	
	let Matches = 0;
	for ( let [MatchUrl,NewUrl] of Object.entries(RewriteMap) )
	{
		function GetNewUrl(MatchString)
		{
			Matches++;
			//console.warn(`GetNewUrl(${Match})`);
			let Replacement = MatchString.replace(MatchUrl,NewUrl);
			return Replacement;
		}
		//	gr: simpler without regex
		const Pattern = `repositoryURL = "${MatchUrl}";`;
		//const regex = new RegExp(Pattern);
		const NewPbx = Pbx.replaceAll( Pattern, GetNewUrl );
		if ( NewPbx == Pbx )
			throw `Failed to match replacing-url ${MatchUrl}`;

		Pbx = NewPbx;
	}
	
	console.log(`---------Replacing ${PbxPath} after ${Object.entries(RewriteMap).length} changes...`);
	await FileSystem.writeFile( PbxPath, Pbx );
}

//	return dictionary of [MatchUrl] = NewUrl
function ParseRewritePackageUrls(RewritePackageUrls)
{
	//	mutliple entries with ;
	RewritePackageUrls = RewritePackageUrls.split(';');
	
	const RewriteMap = {};
	for ( let KeyValue of RewritePackageUrls )
	{
		const Parts = KeyValue.split('=');
		if ( Parts.length != 2 )
		{
			throw `Rewrite-url pattern expected \"old=new;\" got \"${KeyValue}\"`;
		}
		RewriteMap[Parts[0]] = Parts[1];
	}
	return RewriteMap;
}

//	assume params are present from caller
//	only param testing here is for specific validation
export async function Build(ProjectPath,Scheme,Destination,Sdk,Configuration,AdditionalParams,Clean,RewritePackageUrls)
{
	//	append xcodeproj if missing
	//	if omitted from build, it looks in the current path for any .xcodeproj
	//	but using -project requires .xcodeproj in the argument
	if ( ProjectPath )
		ProjectPath = await ResolveProjectPath(ProjectPath);
	
	let BuildParams = new AppleBuildParams(ProjectPath, Scheme, Destination, Sdk, Configuration, AdditionalParams );

	if ( Clean )
	{
		console.log(`---------Cleaning ${BuildParams.description}...`);
		await CleanProject(BuildParams);
	}
	
	if ( RewritePackageUrls )
	{
		const RewriteMap = ParseRewritePackageUrls(RewritePackageUrls);
		await RewritePackageUrlInPbxProj(ProjectPath,RewriteMap);
	}
	
	//	print out debug
	await PrintProjectSchemesAndConfigurations(BuildParams.ProjectPath);
	const ProjectMeta = await GetProjectMeta(BuildParams);
	
	console.log(`---------Building ${BuildParams.description}...`);
	//	this doesn't output new meta, we have to assume it matches the results of GetProjectMeta()
	await BuildProject(BuildParams);
	
	
	return ProjectMeta;
}

//	returns new meta 
//	.ProductDirectory
//	.ProductFilename
export async function ZipProduct(ProductDirectory,ProductName)
{
	//	we use ditto to preserve symlinks
	//	ditto -c -k --sequesterRsrc --keepParent /volume/hello/world.app helloworld.zip
	const OutputDirectory = `./`;
	const OutputFilename = `${ProductName}.zip`;
	const OutputPath = `${OutputDirectory}${OutputFilename}`;
	const InputFilename = `${ProductDirectory}/${ProductName}`;
	
	const Args = 
	[
	 '-c -k --sequesterRsrc --keepParent',
	 InputFilename,
	 OutputPath
	];
	await Exec("ditto", Args );
	
	const OutputMeta = {};
	OutputMeta.ProductDirectory = OutputDirectory;
	OutputMeta.ProductFilename = OutputFilename;
	return OutputMeta;
}
