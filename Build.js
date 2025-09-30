import ChildProcess from "child_process";



function CreatePromise()
{
	let Callbacks = {};
	let PromiseHandler = function (Resolve,Reject)
	{
		Callbacks.Resolve = Resolve;
		Callbacks.Reject = Reject;
	}
	let Prom = new Promise(PromiseHandler);
	Prom.Resolve = Callbacks.Resolve;
	Prom.Reject = Callbacks.Reject;
	return Prom;
}

function PrintStdOut(Lines)
{
	for ( let Line of Lines )
	{
		console.log(`${Line}`);
	}
}

function PrintStdErr(Lines)
{
	for ( let Line of Lines )
	{
		console.warn(`${Line}`);
	}
}

//	the childprocess exec isnt actually async
//	lets make a nicer func
//	plus, spawn() and exec() work quite differently.
//	similarly, some uses of exec with escaping arguments break some apps
//	and not others
async function Exec(Exe,Arguments,OnStdOut,OnStdErr,UseSpawn=false,EscapeArguments=false)
{
	OnStdOut = OnStdOut ?? PrintStdOut;
	OnStdErr = OnStdErr ?? PrintStdErr;
	
	const ExecPromise = CreatePromise();

	//	need to use spawn for long running or large-output executions
	if ( UseSpawn )
	{
		let ProcessError;
		function OnProcessError(Error)
		{
			ProcessError = Error;
		}
		function OnProcessExit(ExitCode)
		{
			//console.log(`OnProcessExit(${ExitCode}) null=crash`);
			if ( ExitCode === null )
				return OnError(`Null exit code from process (crash?)`);
			
			if ( ProcessError )
				ExecPromise.Reject(ProcessError);
			else if ( ExitCode != 0 )
				ExecPromise.Reject(`ExitCode=${ExitCode}`);
			else
				ExecPromise.Resolve(ExitCode);
		}
		
		//	buffer to one big string
		let AllStdOut = "";
		let AllStdErr = "";
		function OnProcessStdOut(Data)
		{
			let Lines = Data.toString().split('\n').map( Line => Line.trimEnd() ).filter( Line => Line.length > 0 );
			OnStdOut(Lines);
		}
		function OnProcessStdErr(Data)
		{
			let Lines = Data.toString().split('\n').map( Line => Line.trimEnd() ).filter( Line => Line.length > 0 );
			OnStdErr(Lines);
		}
		
		const Process = ChildProcess.spawn( Exe, Arguments );
		Process.on('error',OnProcessError);
		Process.stdout.on('data',OnProcessStdOut);
		Process.stderr.on('data',OnProcessStdErr);
		Process.on("close",OnProcessExit);
	}
	else
	{
		function OnFinished(ExecError,StdOut,StdErr)
		{
			//  gr; is this not a string?
			const StdOutLines = StdOut.toString().split('\n').filter( Line => Line.length > 0 );
			OnStdOut(StdOutLines);
			
			const StdErrLines = StdErr.toString().split('\n').filter( Line => Line.length > 0 );
			OnStdErr(StdErrLines);
			
			if ( ExecError )
				ExecPromise.Reject(ExecError);
			else
				ExecPromise.Resolve();
		}
		
		function GetCmdEscaped()
		{
			function EscapeArg(Argument)
			{
				return Argument.replace(' ','\\ ');
			}
			let EscapedArguments = Arguments.map(EscapeArg);
			return `${Exe} ${EscapedArguments.join(' ')}`;
		}
		function GetCmdNotEscaped()
		{
			return `${Exe} ${Arguments.join(' ')}`;
		}
		
		const Command = EscapeArguments ? GetCmdEscaped() : GetCmdNotEscaped();
		
		console.log(`exec(${Command})`);
		const ExecProcessMeta = await ChildProcess.exec( Command, OnFinished );
	}
	
	//console.log(`exec finished=${JSON.stringify(ExecProcessMeta)}`);
	await ExecPromise;
	return;
}

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
	//	BuildProductDir overriding output path 
	constructor(ProjectPath,Scheme,Destination,Sdk,Configuration,AdditionalParams,BuildProductDir)
	{
		//	append xcodeproj if missing
		if ( ProjectPath && !ProjectPath.endsWith('.xcodeproj') )
			ProjectPath += '.xcodeproj';
		
		Destination = SanitiseXcodeDestination(Destination);
		
		//	required (thus turn to string)
		this.Scheme = `${Scheme}`;
		this.Configuration = `${Configuration}`;
		this.Destination = `${Destination}`;
		this.BuildProductDir = `${BuildProductDir}`;
		
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

		//	require these
		Args.push(`-scheme`, this.Scheme );

		//	all optional
		if ( this.ProjectPath )
			Args.push(`-project`,this.ProjectPath);
	
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
	
	const IncludeDestination = true;
	const IncludeConfiguration = true;
	const PreBuildOptions = BuildParams.GetXcodeArguments(IncludeDestination,IncludeConfiguration);
	PreBuildOptions.push(`-showBuildSettings`);

	console.log(`Listing build settings for ${BuildParams.description}...`);
	const ExecResult = await Exec(
				"xcodebuild",
				PreBuildOptions,
				OnStdOut,
								  null,
								  true
					);
	
	
	return ProjectMeta;
}

//	returns meta
//	.BuildProductDirectory
//	.BuildProductFilename
async function BuildProject(BuildParams)
{
	const BuildOptions = BuildParams.GetXcodeArguments();
	
	//	add -showBuildSettings to get build-param output we can match
	BuildOptions.push(`-showBuildSettings`);
	
	let ProjectMeta = {};
	
	function OnStdOut(Lines)
	{
		PrintStdOut(Lines);
		ProjectMeta = GatherProjectMeta(Lines,ProjectMeta);
	}
	
	const UseSpawn = true;
	await Exec(
			   "xcodebuild",
			   BuildOptions,
			   OnStdOut,
			   null,
			   UseSpawn
			   );
	
	console.log(JSON.stringify(ProjectMeta));
	if ( !ProjectMeta.BuildDirectorys.length )
		throw `Build didn't produce any build directories`;
	
	return ProjectMeta;
}

export async function Clean(BuildScheme,Destination,Sdk,Configuration)
{
	throw `todo: clean`
}

//	assume params are present from caller
//	only param testing here is for specific validation
export async function Build(ProjectPath,Scheme,Destination,Sdk,Configuration,BuildProductDir,AdditionalParams)
{
	let BuildParams = new AppleBuildParams(ProjectPath, Scheme, Destination, Sdk, Configuration, AdditionalParams, BuildProductDir );
	
	//	print out debug
	await PrintProjectSchemesAndConfigurations(BuildParams.ProjectPath);
	const ProjectMeta = await GetProjectMeta(BuildParams);
	
	console.log(`Building ${BuildParams.description}...`);
	const BuildMeta = await BuildProject(BuildParams);
	
	
	/*
	
	//  gr: Scheme.framework is not neccessarily the output
	//  todo: get product name from build settings
	let TargetDir;
	
	//  tsdk: For some reason these have undefined as the first item in the set?
	Object.values(Regex).map( key => key.results.delete(undefined));
	
	if( Regex.BuildDirectorys.results.size && Regex.FullProductName.results.size)
	{
		console.log(`Using a Build Directory and FullProductName output: `)
		console.log(Regex.BuildDirectorys.results)
		console.log(Regex.FullProductName.results)
		
		// This is how you get the first item of a set
		TargetDir = Regex.BuildDirectorys.results.values().next().value;
		
		let FileName = Regex.FullProductName.results.values().next().value;
		
		TargetDir += `/${FileName}`;
		//    use the filename specified, as the upload filename
		if ( !UploadFilename )
			UploadFilename = FileName;
	}
	else if ( Regex.ScriptOutput.results.size )
	{
		console.log(`Using a script output: `)
		console.log(Regex.ScriptOutput.results);
		if ( Regex.ScriptOutput.results.size > 1 )
		{
			console.log(`Warning: Found multiple script output files!`);
			TargetDir = Regex.ScriptOutput.results.values().next().value;
		}
	}
	else
	{
		Object.values(Regex).map( key => console.log(key.results));
		throw `Failed to find valid BuildDirectorys, FullProduct Names or Script Outputs from stdout`;
	}
	
	TargetDir = normalize(TargetDir);
	
	console.log(`TargetDir=${TargetDir} (ls before upload)`);
	await exec.exec("ls -l", [TargetDir] );
	
	console.log(`Uploading (UPLOAD_NAME=${UploadFilename}), with UPLOAD_DIR=${TargetDir}`);
	core.setOutput('UPLOAD_NAME', UploadFilename);
	core.setOutput('UPLOAD_DIR', TargetDir);
 */
}
