import sys
import json
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound

def fetch_intro(video_id):
    try:
        # returns a TranscriptList object
        # Try static first (standard), then instance
        try:
             transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        except AttributeError:
             # Maybe it's an instance method in this weird version?
             api = YouTubeTranscriptApi()
             if hasattr(api, 'list_transcripts'):
                 transcript_list = api.list_transcripts(video_id)
             elif hasattr(api, 'list'):
                 transcript_list = api.list(video_id)
             else:
                 # Static fallback to 'list'
                 transcript_list = YouTubeTranscriptApi.list(video_id)
        
        # If we reached here, transcript_list should be set.
        # Now try to extract data
        data = []
        if hasattr(transcript_list, 'find_transcript'):
            try:
                t = transcript_list.find_transcript(['en'])
            except:
               try:
                   t = transcript_list.find_manually_created_transcript(['en'])
               except:
                   t = transcript_list[0] # Fallback to first available
            
        if hasattr(transcript_list, 'find_transcript'):
            try:
                t = transcript_list.find_transcript(['en'])
            except:
               try:
                   t = transcript_list.find_manually_created_transcript(['en'])
               except:
                   t = transcript_list[0] # Fallback to first available
            
            # Fetch the actual data
            data = t.fetch()
        else:
            # Assume it's directly the list of dicts
            data = transcript_list
        
        intro_text = ""
        duration_acc = 0.0
        
        for item in data:
            # Handle both dict and object access
            if isinstance(item, dict):
                text = item['text']
                duration = item['duration']
            else:
                # Assume object attributes
                text = getattr(item, 'text', '')
                duration = getattr(item, 'duration', 0.0)

            intro_text += text + " "
            duration_acc += duration
            
            # Stop after 60 seconds or 1000 chars
            if duration_acc > 60.0 or len(intro_text) > 1000:
                break
                
        result = {
            "videoId": video_id,
            "text": intro_text.strip(),
            "isAvailable": True
        }
        print(json.dumps(result))
        
    except (TranscriptsDisabled, NoTranscriptFound) as e:
        # Graceful failure
        print(json.dumps({"videoId": video_id, "text": "", "isAvailable": False, "error": "No Transcript"}))
    except Exception as e:
        # Catch-all for other errors
        print(json.dumps({"videoId": video_id, "text": "", "isAvailable": False, "error": str(e)}))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No video ID provided"}))
        sys.exit(1)
        
    video_id = sys.argv[1]
    fetch_intro(video_id)
