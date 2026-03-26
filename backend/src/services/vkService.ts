const VK_TOKEN = process.env.VK_GROUP_TOKEN;
const VK_API_VERSION = '5.131';

/** Send a simple text message via VK Messages API */
export async function sendVkMessage(userId: number | string, message: string): Promise<void> {
    if (!VK_TOKEN) {
        console.warn('[VK] VK_GROUP_TOKEN not set, skipping message');
        return;
    }

    try {
        const params = new URLSearchParams({
            user_id: String(userId),
            random_id: String(Math.floor(Math.random() * 2000000000)),
            message,
            access_token: VK_TOKEN,
            v: VK_API_VERSION,
        });

        const res = await fetch(`https://api.vk.com/method/messages.send?${params.toString()}`);
        const data = await res.json();

        if (data.error) {
            console.error('[VK] messages.send error:', data.error);
        }
    } catch (error) {
        console.error('[VK] sendVkMessage exception:', error);
    }
}

/** Send a photo via VK Messages API (requires multi-step upload) */
export async function sendVkPhoto(userId: number | string, photoUrl: string, caption?: string): Promise<void> {
    if (!VK_TOKEN) {
        console.warn('[VK] VK_GROUP_TOKEN not set, skipping photo');
        return;
    }

    try {
        // 1. Get upload server
        const serverParams = new URLSearchParams({
            peer_id: String(userId),
            access_token: VK_TOKEN,
            v: VK_API_VERSION,
        });
        const serverRes = await fetch(`https://api.vk.com/method/photos.getMessagesUploadServer?${serverParams.toString()}`);
        const serverData = await serverRes.json();

        if (serverData.error || !serverData.response?.upload_url) {
            console.error('[VK] getMessagesUploadServer error:', JSON.stringify(serverData.error || 'No response'));
            return await sendVkMessage(userId, (caption ? caption + '\n\n' : '') + photoUrl);
        }

        const uploadUrl = serverData.response.upload_url;

        // 2. Download photo from URL
        const imgRes = await fetch(photoUrl);
        const imgBuffer = await imgRes.arrayBuffer();
        console.log(`[VK] Downloaded ticket image, size: ${imgBuffer.byteLength} bytes`);

        if (imgBuffer.byteLength === 0) {
            console.error('[VK] Downloaded ticket image is empty!');
            return await sendVkMessage(userId, (caption ? caption + '\n\n' : '') + photoUrl);
        }

        const blob = new Blob([imgBuffer], { type: 'image/png' });

        // 3. Upload to VK
        // IMPORTANT: VK docs specify 'file' field for photos.getMessagesUploadServer
        const formData = new FormData();
        formData.append('file', blob, 'ticket.png');
        formData.append('photo', blob, 'ticket.png'); // Fallback for some versions

        const uploadRes = await fetch(uploadUrl, {
            method: 'POST',
            body: formData,
        });
        const uploadData = await uploadRes.json();

        if (!uploadData.photo && !uploadData.file) {
            console.error('[VK] upload photo failed (no photo/file in response):', JSON.stringify(uploadData));
            return await sendVkMessage(userId, (caption ? caption + '\n\n' : '') + photoUrl);
        }

        // 4. Save photo
        // saveMessagesPhoto expects the value from 'photo' field of upload response
        const photoToSave = uploadData.photo || uploadData.file;
        const saveParams = new URLSearchParams({
            photo: photoToSave,
            server: String(uploadData.server),
            hash: uploadData.hash,
            access_token: VK_TOKEN,
            v: VK_API_VERSION,
        });
        const saveRes = await fetch(`https://api.vk.com/method/photos.saveMessagesPhoto?${saveParams.toString()}`);
        const saveData = await saveRes.json();

        if (saveData.error || !saveData.response?.[0]) {
            console.error('[VK] saveMessagesPhoto error:', JSON.stringify(saveData.error || 'No response'));
            return await sendVkMessage(userId, (caption ? caption + '\n\n' : '') + photoUrl);
        }

        const photo = saveData.response[0];
        const attachment = `photo${photo.owner_id}_${photo.id}`;

        // 5. Send message with attachment
        const sendParams = new URLSearchParams({
            peer_id: String(userId),
            random_id: String(Math.floor(Math.random() * 2000000000)),
            message: caption || '',
            attachment,
            access_token: VK_TOKEN,
            v: VK_API_VERSION,
        });

        const finalRes = await fetch(`https://api.vk.com/method/messages.send?${sendParams.toString()}`);
        const finalData = await finalRes.json();

        if (finalData.error) {
            console.error('[VK] messages.send with photo error:', JSON.stringify(finalData.error));
            // Fallback to text link if photo attachment fails
            return await sendVkMessage(userId, (caption ? caption + '\n\n' : '') + photoUrl);
        }
        console.log(`[VK] Ticket sent successfully to user ${userId}`);
    } catch (error) {
        console.error('[VK] sendVkPhoto exception:', error);
        // Fallback
        await sendVkMessage(userId, (caption ? caption + '\n\n' : '') + photoUrl);
    }
}
