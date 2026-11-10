// Bounded multipart parser for exactly four fields in an owner-only photo form.
// Rejects ambiguous boundary/headers and duplicate fields before any file writes.
const MAX_MULTIPART_BYTES=4*1024*1024+4096;
export async function readOwnerPhotoForm(request) {
  const type=request.headers["content-type"] ?? "";
  const m=/^multipart\/form-data;\s*boundary=([-_A-Za-z0-9]{8,70})$/i.exec(type);
  if(!m)throw Error("Invalid owner photo Content-Type");
  if(request.headers["content-encoding"] && request.headers["content-encoding"]!=="identity")
    throw Error("Unsupported owner upload compression");
  if(Number(request.headers["content-length"])>MAX_MULTIPART_BYTES)
    throw Error("Owner photo upload too large");
  const chunks=[];
  let total=0;
  for await (const chunk of request) {
    total+=chunk.length;
    if(total>MAX_MULTIPART_BYTES)throw Error("Owner photo upload too large");
    chunks.push(chunk);
  }
  const body=Buffer.concat(chunks);
  const opener=Buffer.from("--"+m[1]+"\r\n","ascii");
  const marker=Buffer.from("\r\n--"+m[1],"ascii");
  if(body.length<opener.length+8 || !body.subarray(0,opener.length).equals(opener))
    throw Error("Invalid owner multipart boundary");
  let cursor=opener.length;
  const fields={};
  let done=false;
  for(let i=0;i<5;i++){
    const headEnd=body.indexOf(Buffer.from("\r\n\r\n"),cursor);
    if(headEnd<0||headEnd-cursor>512)throw Error("Invalid upload header");
    const header=body.subarray(cursor,headEnd).toString("latin1");
    const parts=header.split("\r\n");
    const disposition=parts.find(v=>/^content-disposition:/i.test(v));
    const found=/^content-disposition: form-data; name="(csrf|id|revision|lang|photo)"(?:; filename="[^"\r\n]{0,120}")?$/i.exec(disposition??"");
    if(!found || parts.length>2)throw Error("Unapproved multipart field");
    const name=found[1];
    if(Object.hasOwn(fields,name))throw Error("Duplicate multipart field");
    const dataAt=headEnd+4;
    const partEnd=body.indexOf(marker,dataAt);
    if(partEnd<0)throw Error("Unclosed multipart body");
    const data=body.subarray(dataAt,partEnd);
    if(name!=="photo" && (data.length>256 || !/^[\x20-\x7e]*$/.test(data.toString("latin1"))))
      throw Error("Invalid photo form field");
    if(name==="photo" && !/filename="/i.test(disposition))throw Error("Filename missing");
    fields[name]=name==="photo" ? Buffer.from(data):data.toString("utf8");
    const suffix=partEnd+marker.length;
    if(body.subarray(suffix,suffix+2).toString("ascii")==="--"){
      if(suffix+2!==body.length && (suffix+4!==body.length ||
          body.subarray(suffix+2).toString("ascii")!=="\r\n"))throw Error("Unexpected multipart trailer");
      done=true;break;
    }
    if(body.subarray(suffix,suffix+2).toString("ascii")!=="\r\n")
      throw Error("Invalid multipart continuation");
    cursor=suffix+2;
  }
  if(!done || Object.keys(fields).sort().join(",")!=="csrf,id,lang,photo,revision")
    throw Error("Incomplete photo form");
  return fields;
}
