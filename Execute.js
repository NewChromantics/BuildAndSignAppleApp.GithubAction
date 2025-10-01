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


//	pass false to not-trim
export function PrintStdOut(Lines,TrimLength=150)
{
	for ( let Line of Lines )
	{
		if ( TrimLength != false && Line.length > TrimLength )
		{
			Line = Line.substring( 0, TrimLength );
			Line += '...';
		}
		console.log(`${Line}`);
	}
}

export function PrintStdErr(Lines)
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
export async function Exec(Exe,Arguments,OnStdOut,OnStdErr,UseSpawn=false,EscapeArguments=false)
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
		
		console.log(`Spawn(${Exe},${Arguments})`);
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
