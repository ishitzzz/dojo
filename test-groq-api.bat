.@echo off
REM Test Groq API with curl
echo Testing Groq API...
echo.

REM Read API key from .env.local
for /f "tokens=2 delims==" %%a in ('findstr "GROQ_API_KEY" .env.local') do set GROQ_KEY=%%a

echo Using API Key: %GROQ_KEY:~0,15%...
echo.

curl https://api.groq.com/openai/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer %GROQ_KEY%" ^
  -d "{\"messages\": [{\"role\": \"user\", \"content\": \"Say hello\"}], \"model\": \"llama-3.3-70b-versatile\"}"

echo.
echo.
echo If you see a valid JSON response above, the API key works!
echo If you see a 401 error, the API key is invalid.
pause
