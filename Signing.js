import { Exec, PrintStdOut } from "./Execute.js";
import { MatchRegex } from './Build.js';

//	notarise app in-place
export async function NotarizeAndStapleApp(ProductDirectory,ProductFilename,TeamIdentifier,AppleId,AppleIdPassword)
{
	let SubmissionIds = [];
	function OnStdOut(Lines)
	{
		PrintStdOut(Lines);
		const SubmissionIdPattern = `^id:\\s([a-f0-9-]+)$`;
		const NewSubmissionIds = MatchRegex(Lines,SubmissionIdPattern);
		
		if ( NewSubmissionIds.length )
		{
			console.log(`Found notarize submission id(s): ${NewSubmissionIds}`);
			SubmissionIds.push(...NewSubmissionIds);
		}
	}
	

	//	zip to submit
	const AppFilename = `${ProductDirectory}/${ProductFilename}`;
	const ZipMeta = await ZipProduct(ProductDirectory,ProductFilename);
	const ZipFilename = `${ZipMeta.ProductDirectory}${ZipMeta.ProductFilename}`;
	console.log(`Submitting zip to notarization; ${ZipFilename}...`);

	
	const NotarizeSubmitArgs = 
	[
		`notarytool`,`submit`,
		`${ZipFilename}`,
		`--apple-id`,AppleId,
		`--team-id`,TeamIdentifier,
		`--password`,AppleIdPassword,
		`--wait`,
		`--progress`
	];
	
	
	//	todo: even if this fails, print log
	const SpawnProcess = true;
	await Exec(`xcrun`,NotarizeSubmitArgs,OnStdOut,null,SpawnProcess);

	const SubmissionId = SubmissionIds[0];
	if ( !SubmissionId )
		throw `Failed to get submission id from notarization (SubmissionIds=${JSON.stringify(SubmissionIds)})`;

	//	grab logs regardless
	const NotarizeLogArgs = 
	[
		`notarytool`,`log`,
		SubmissionId,
		`--apple-id`,AppleId,
		`--team-id`,TeamIdentifier,
		`--password`,AppleIdPassword
	];
	await Exec(`xcrun`,NotarizeLogArgs,null,null,SpawnProcess);

	//	re-staple app in-place
	const StapleArgs = 
	[
	 `stapler`,`staple`,AppFilename
	];
	console.log(`Staple app after notarisation...`);
	await Exec(`xcrun`, StapleArgs,null,null,SpawnProcess);
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
