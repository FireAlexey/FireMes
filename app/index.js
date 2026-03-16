import { Audio } from 'expo-av'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import {
  get, onChildAdded, onChildChanged, onChildRemoved,
  onValue, push, ref, remove, set, update
} from 'firebase/database'
import { useEffect, useRef, useState } from 'react'
import {
  Alert, Animated, FlatList, KeyboardAvoidingView,
  Linking, Modal, Platform, ScrollView, StyleSheet,
  Switch, Text, TextInput, TouchableOpacity, View
} from 'react-native'
import { auth, db } from '../firebase'

const CLOUDINARY_CLOUD = 'dujwxwpxo'
const CLOUDINARY_PRESET = 'firemes'

const THEMES = {
  light: {
    bg: '#efeff4', chatBg: '#efeff4', header: '#2481cc', headerText: '#fff',
    headerSub: 'rgba(255,255,255,0.75)', authBg: '#fff', title: '#2481cc',
    input: '#fff', inputBorder: '#d9d9d9', inputText: '#000',
    msgMine: '#effdde', msgMineText: '#000', msgMineTime: 'rgba(0,0,0,0.38)',
    msgOther: '#fff', msgOtherText: '#000', msgOtherTime: '#8d8d8d',
    nick: '#2481cc', inputArea: '#f7f7f7', inputAreaBorder: '#e5e5e5',
    placeholder: '#aaa', contactBg: '#fff', contactText: '#000', contactSub: '#8d8d8d',
    divider: '#e5e5e5', modalBg: '#fff', sidebarBg: '#fff', sidebarText: '#000',
    settingsBg: '#efeff4', settingsItem: '#fff', previewBg: '#f7f7f7',
    danger: '#ff3b30', adminColor: '#ff9500', tabActive: '#2481cc',
    favColor: '#f5a623', sendBtn: '#2481cc', editBarColor: '#2481cc', checkColor: '#5ac85a',
  },
  dark: {
    bg: '#212121', chatBg: '#212121', header: '#1f1f1f', headerText: '#fff',
    headerSub: 'rgba(255,255,255,0.55)', authBg: '#212121', title: '#5aabf0',
    input: '#2b2b2b', inputBorder: '#3a3a3a', inputText: '#fff',
    msgMine: '#2b5278', msgMineText: '#fff', msgMineTime: 'rgba(255,255,255,0.45)',
    msgOther: '#2b2b2b', msgOtherText: '#fff', msgOtherTime: '#8d8d8d',
    nick: '#5aabf0', inputArea: '#1f1f1f', inputAreaBorder: '#333',
    placeholder: '#555558', contactBg: '#212121', contactText: '#fff', contactSub: '#8d8d8d',
    divider: '#333', modalBg: '#2b2b2b', sidebarBg: '#212121', sidebarText: '#fff',
    settingsBg: '#212121', settingsItem: '#2b2b2b', previewBg: '#2b2b2b',
    danger: '#ff453a', adminColor: '#ff9f0a', tabActive: '#5aabf0',
    favColor: '#f5a623', sendBtn: '#2481cc', editBarColor: '#5aabf0', checkColor: '#5ac85a',
  }
}

const AV_COLORS = ['#c03d33','#4fad2d','#d09306','#168acd','#8544d6','#cd4073','#2996ad','#ce671b']
function acol(s) { let h=0; for(let i=0;i<s.length;i++) h=s.charCodeAt(i)+((h<<5)-h); return AV_COLORS[Math.abs(h)%AV_COLORS.length] }

function getChatId(a,b) { return [a,b].sort().join('_') }

async function uploadToCloudinary(uriOrFile) {
  const fd = new FormData()
  if (Platform.OS === 'web') { fd.append('file', uriOrFile) }
  else { fd.append('file', { uri: uriOrFile, name: uriOrFile.split('/').pop(), type: 'application/octet-stream' }) }
  fd.append('upload_preset', CLOUDINARY_PRESET)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/auto/upload`, { method:'POST', body:fd })
  return (await res.json()).secure_url
}

function Avatar({ url, letter, size=44, onPress, color }) {
  const bg = color || (letter ? acol(letter) : '#2481cc')
  const el = (
    <View style={{ width:size, height:size, borderRadius:size/2, backgroundColor:bg, justifyContent:'center', alignItems:'center', overflow:'hidden' }}>
      {url ? <Image source={{uri:url}} style={{width:size,height:size}} contentFit="cover" />
            : <Text style={{color:'#fff',fontWeight:'600',fontSize:size*0.4}}>{letter?.toUpperCase()}</Text>}
    </View>
  )
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.8}>{el}</TouchableOpacity> : el
}

function confirm(msg, onYes, yesLabel='Удалить') {
  if (Platform.OS === 'web') { if(window.confirm(msg)) onYes(); return }
  Alert.alert('', msg, [{text:'Отмена',style:'cancel'},{text:yesLabel,style:'destructive',onPress:onYes}])
}

function msgMenu(options, onSelect) {
  if (Platform.OS === 'web') {
    const n = parseInt(window.prompt(options.map((o,i)=>`${i+1}. ${o.label}`).join('\n')),10)
    if(!isNaN(n) && n>=1 && n<=options.length) onSelect(options[n-1]); return
  }
  Alert.alert('','',[
    ...options.map(o=>({text:o.label,style:o.danger?'destructive':'default',onPress:()=>onSelect(o)})),
    {text:'Отмена',style:'cancel'}
  ])
}

// ── MemberRow: standalone component with its own subscription ────────────────
function MemberRow({ uid, t, isOwner, isAdminMember, isSelf, amAdmin, onToggleAdmin, onRemove }) {
  const [info, setInfo] = useState(null)
  useEffect(() => {
    const unsub = onValue(ref(db, 'users/'+uid), snap => { if(snap.val()) setInfo(snap.val()) })
    return ()=>unsub()
  }, [uid])
  if (!info) return null
  return (
    <View style={[s.memberRow, {borderBottomColor:t.divider}]}>
      <Avatar url={info.avatar||null} letter={info.nickname?.[0]||'?'} size={42} />
      <View style={{flex:1, marginLeft:12}}>
        <Text style={{color:t.contactText,fontSize:15,fontWeight:'500'}}>{info.nickname}</Text>
        <Text style={{color:isOwner?t.favColor:isAdminMember?t.adminColor:t.contactSub,fontSize:12}}>
          {isOwner ? '♛ Создатель' : isAdminMember ? '✦ Администратор' : '· Участник'}
        </Text>
      </View>
      {amAdmin && !isSelf && !isOwner && (
        <View style={{flexDirection:'row',gap:6}}>
          <TouchableOpacity style={[s.memberBtn,{backgroundColor:isAdminMember?t.contactSub:t.adminColor}]} onPress={onToggleAdmin}>
            <Text style={{color:'#fff',fontSize:11,fontWeight:'700'}}>{isAdminMember?'Снять':'Админ'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.memberBtn,{backgroundColor:t.danger}]} onPress={onRemove}>
            <Text style={{color:'#fff',fontSize:11,fontWeight:'700'}}>Удалить</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null)
  const [userNick, setUserNick] = useState('')
  const [userAvatar, setUserAvatar] = useState(null)
  const [isDark, setIsDark] = useState(false)
  const [screen, setScreen] = useState('auth')
  const [tab, setTab] = useState('chats')

  const sidebarAnim = useRef(new Animated.Value(-300)).current
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const [email, setEmail] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)

  const [contacts, setContacts] = useState([])
  const [selectedContact, setSelectedContact] = useState(null)
  const [addModal, setAddModal] = useState(false)
  const [searchNick, setSearchNick] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searchError, setSearchError] = useState('')

  const [groups, setGroups] = useState([])
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [currentGroupData, setCurrentGroupData] = useState(null)
  const [createGroupModal, setCreateGroupModal] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupDesc, setGroupDesc] = useState('')
  const [groupMembersForCreate, setGroupMembersForCreate] = useState([])

  const [editGroupModal, setEditGroupModal] = useState(false)
  const [editGroupName, setEditGroupName] = useState('')
  const [editGroupDesc, setEditGroupDesc] = useState('')
  const [editGroupAvatar, setEditGroupAvatar] = useState(null)
  const [editGroupAvatarUploading, setEditGroupAvatarUploading] = useState(false)

  const [groupMembersModal, setGroupMembersModal] = useState(false)
  const [addMemberModal, setAddMemberModal] = useState(false)
  const [addMemberNick, setAddMemberNick] = useState('')
  const [addMemberResult, setAddMemberResult] = useState(null)
  const [addMemberError, setAddMemberError] = useState('')

  const [newNick, setNewNick] = useState('')
  const [notifications, setNotifications] = useState(true)
  const [avatarUploading, setAvatarUploading] = useState(false)

  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const flatListRef = useRef()

  const [editingMsg, setEditingMsg] = useState(null)
  const [editText, setEditText] = useState('')

  const [recording, setRecording] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const [playingSound, setPlayingSound] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const recordingTimer = useRef(null)
  const [preview, setPreview] = useState(null)

  const t = isDark ? THEMES.dark : THEMES.light

  // ── FIX: amGroupAdmin reads from currentGroupData which stays live via onValue ──
  // This means even when you first enter a group, as soon as the subscription fires
  // currentGroupData is populated and amGroupAdmin becomes correct.
  const amGroupAdmin = !!(
    screen === 'groupchat' && user && currentGroupData &&
    (currentGroupData.createdBy === user.uid || currentGroupData.admins?.[user.uid])
  )

  function openSidebar() {
    setSidebarOpen(true)
    Animated.timing(sidebarAnim,{toValue:0,duration:220,useNativeDriver:true}).start()
  }
  function closeSidebar() {
    Animated.timing(sidebarAnim,{toValue:-300,duration:220,useNativeDriver:true}).start(()=>setSidebarOpen(false))
  }

  useEffect(() => {
    return auth.onAuthStateChanged(async u => {
      if (u) {
        setUser(u)
        const snap = await get(ref(db,'users/'+u.uid))
        const data = snap.val()||{}
        setUserNick(data.nickname||'User'); setNewNick(data.nickname||'User'); setUserAvatar(data.avatar||null)
        setScreen('contacts')
      } else { setUser(null); setScreen('auth') }
    })
  }, [])

  useEffect(() => {
    if (!user) return
    return onValue(ref(db,'contacts/'+user.uid), async snap => {
      const data = snap.val()||{}
      const list = await Promise.all(Object.keys(data).map(async uid => {
        const s = await get(ref(db,'users/'+uid))
        return { uid, nickname:s.val()?.nickname||'Unknown', avatar:s.val()?.avatar||null }
      }))
      setContacts(list)
    })
  }, [user])

  useEffect(() => {
    if (!user) return
    return onValue(ref(db,'groups'), snap => {
      const data = snap.val()||{}
      setGroups(Object.entries(data).filter(([,g])=>g.members?.[user.uid]).map(([id,g])=>({id,...g})))
    })
  }, [user])

  // ── Live group subscription – this is what makes amGroupAdmin reactive ──
  useEffect(() => {
    if (!selectedGroup?.id) { setCurrentGroupData(null); return }
    const unsub = onValue(ref(db,'groups/'+selectedGroup.id), snap => {
      setCurrentGroupData(snap.val() ? {id:selectedGroup.id,...snap.val()} : null)
    })
    return ()=>unsub()
  }, [selectedGroup?.id])

  const chatPath = (() => {
    if (screen==='groupchat' && selectedGroup) return 'groupchats/'+selectedGroup.id
    if (screen==='favorites' && user) return 'favorites/'+user.uid
    if (screen==='chat' && selectedContact && user) return 'chats/'+getChatId(user.uid,selectedContact.uid)
    return null
  })()

  useEffect(() => {
    if (!chatPath) return
    setMessages([])
    const r = ref(db, chatPath)
    const ua = onChildAdded(r, s=>setMessages(p=>[...p,{key:s.key,...s.val()}]))
    const uc = onChildChanged(r, s=>setMessages(p=>p.map(m=>m.key===s.key?{key:s.key,...s.val()}:m)))
    const ur = onChildRemoved(r, s=>setMessages(p=>p.filter(m=>m.key!==s.key)))
    return ()=>{ ua(); uc(); ur() }
  }, [chatPath])

  async function sendMessage() {
    if (!chatPath) return
    if (preview) {
      setUploading(true)
      try {
        const url = await uploadToCloudinary(preview.file||preview.uri)
        await push(ref(db,chatPath),{user:userNick,uid:user.uid,text:preview.name||'',fileUrl:url,type:preview.type,timestamp:Date.now()})
      } catch(e){console.error(e)}
      setUploading(false); setPreview(null); return
    }
    if (!text.trim()) return
    await push(ref(db,chatPath),{user:userNick,uid:user.uid,text:text.trim(),type:'text',timestamp:Date.now()})
    setText('')
  }

  async function saveEdit() {
    if (!editingMsg||!editText.trim()||!chatPath) return
    await update(ref(db,chatPath+'/'+editingMsg.key),{text:editText.trim(),edited:true})
    setEditingMsg(null); setEditText('')
  }

  async function deleteMsg(key) {
    if (!chatPath) return
    confirm('Удалить сообщение?', ()=>remove(ref(db,chatPath+'/'+key)))
  }

  // ── FIX: canDelete now correctly includes amGroupAdmin for any message in the group ──
  function handleLongPress(item) {
    const isMine = item.uid === user?.uid
    const canDelete = isMine || amGroupAdmin   // admin can delete ANY message
    const canEdit = isMine && item.type==='text'
    if (!canDelete && !canEdit) return
    const opts = []
    if (canEdit) opts.push({label:'✎  Редактировать',action:'edit'})
    if (canDelete) opts.push({label:'(x)  Удалить',action:'delete',danger:true})
    msgMenu(opts, opt => {
      if (opt.action==='edit') { setEditingMsg(item); setEditText(item.text) }
      if (opt.action==='delete') deleteMsg(item.key)
    })
  }

  async function createGroup() {
    if (!groupName.trim()) return
    const members = {[user.uid]:true}
    groupMembersForCreate.forEach(uid=>{members[uid]=true})
    await push(ref(db,'groups'),{
      name:groupName.trim(),description:groupDesc.trim(),
      createdBy:user.uid,admins:{[user.uid]:true},
      members,createdAt:Date.now()
    })
    setCreateGroupModal(false); setGroupName(''); setGroupDesc(''); setGroupMembersForCreate([])
  }

  function openEditGroup() {
    const g = currentGroupData||selectedGroup
    setEditGroupName(g?.name||''); setEditGroupDesc(g?.description||''); setEditGroupAvatar(g?.avatar||null)
    setEditGroupModal(true)
  }
  async function saveEditGroup() {
    if (!selectedGroup||!editGroupName.trim()) return
    await update(ref(db,'groups/'+selectedGroup.id),{name:editGroupName.trim(),description:editGroupDesc.trim(),avatar:editGroupAvatar||null})
    setEditGroupModal(false)
  }
  async function pickGroupAvatar() {
    if (Platform.OS==='web') {
      const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'
      inp.onchange=async e=>{
        const f=e.target.files[0]; if(!f) return
        setEditGroupAvatarUploading(true)
        try{setEditGroupAvatar(await uploadToCloudinary(f))}catch(e){console.error(e)}
        setEditGroupAvatarUploading(false)
      }; inp.click(); return
    }
    const r=await ImagePicker.launchImageLibraryAsync({mediaTypes:ImagePicker.MediaTypeOptions.Images,allowsEditing:true,aspect:[1,1],quality:0.8})
    if(r.canceled) return
    setEditGroupAvatarUploading(true)
    try{setEditGroupAvatar(await uploadToCloudinary(r.assets[0].uri))}catch(e){console.error(e)}
    setEditGroupAvatarUploading(false)
  }

  async function searchUserForGroup() {
    setAddMemberError(''); setAddMemberResult(null)
    if (!addMemberNick.trim()) return
    const snap=await get(ref(db,'users')); const data=snap.val()||{}
    const found=Object.entries(data).find(([,v])=>v.nickname?.toLowerCase()===addMemberNick.trim().toLowerCase())
    if (!found) { setAddMemberError('Пользователь не найден'); return }
    const g=currentGroupData||selectedGroup
    if (g?.members?.[found[0]]) { setAddMemberError('Уже в группе'); return }
    setAddMemberResult({uid:found[0],nickname:found[1].nickname,avatar:found[1].avatar||null})
  }
  async function addMemberToGroup() {
    if (!addMemberResult||!selectedGroup) return
    await set(ref(db,'groups/'+selectedGroup.id+'/members/'+addMemberResult.uid),true)
    setAddMemberNick(''); setAddMemberResult(null); setAddMemberError(''); setAddMemberModal(false)
  }
  async function removeMember(uid) {
    if (!selectedGroup) return
    confirm('Удалить участника?', async()=>{
      await remove(ref(db,'groups/'+selectedGroup.id+'/members/'+uid))
      await remove(ref(db,'groups/'+selectedGroup.id+'/admins/'+uid))
    })
  }
  async function toggleAdmin(uid) {
    if (!selectedGroup) return
    const isAdm=!!currentGroupData?.admins?.[uid]
    if(isAdm) await remove(ref(db,'groups/'+selectedGroup.id+'/admins/'+uid))
    else await set(ref(db,'groups/'+selectedGroup.id+'/admins/'+uid),true)
  }
  async function leaveGroup() {
    confirm('Покинуть группу?', async()=>{
      await remove(ref(db,'groups/'+selectedGroup.id+'/members/'+user.uid))
      setScreen('contacts'); setSelectedGroup(null); setCurrentGroupData(null)
    },'Выйти')
  }

  async function changeAvatar() {
    if (Platform.OS==='web') {
      const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'
      inp.onchange=async e=>{
        const f=e.target.files[0]; if(!f) return
        setAvatarUploading(true)
        try{const u=await uploadToCloudinary(f);await set(ref(db,'users/'+user.uid+'/avatar'),u);setUserAvatar(u)}catch(e){console.error(e)}
        setAvatarUploading(false)
      }; inp.click(); return
    }
    const r=await ImagePicker.launchImageLibraryAsync({mediaTypes:ImagePicker.MediaTypeOptions.Images,allowsEditing:true,aspect:[1,1],quality:0.8})
    if(r.canceled) return
    setAvatarUploading(true)
    try{const u=await uploadToCloudinary(r.assets[0].uri);await set(ref(db,'users/'+user.uid+'/avatar'),u);setUserAvatar(u)}catch(e){console.error(e)}
    setAvatarUploading(false)
  }

  async function pickFile() {
    if (Platform.OS==='web') {
      const inp=document.createElement('input'); inp.type='file'
      inp.onchange=e=>{
        const f=e.target.files[0]; if(!f) return
        setPreview({type:f.type.startsWith('image/')?'image':'file',uri:URL.createObjectURL(f),name:f.name,file:f})
      }; inp.click(); return
    }
    const r=await DocumentPicker.getDocumentAsync({type:'*/*'})
    if(r.canceled) return
    setPreview({type:'file',uri:r.assets[0].uri,name:r.assets[0].name})
  }

  async function startRecording() {
    if (Platform.OS==='web') {
      try {
        const stream=await navigator.mediaDevices.getUserMedia({audio:true})
        const mr=new MediaRecorder(stream); const chunks=[]
        mr.ondataavailable=e=>chunks.push(e.data)
        mr.onstop=()=>{
          const blob=new Blob(chunks,{type:'audio/webm'})
          setPreview({type:'audio',uri:URL.createObjectURL(blob),name:'Голосовое',file:new File([blob],'voice.webm',{type:'audio/webm'})})
          stream.getTracks().forEach(tr=>tr.stop())
        }
        mr.start(); setRecording(mr); setIsRecording(true); setRecordingTime(0)
        recordingTimer.current=setInterval(()=>setRecordingTime(p=>p+1),1000)
      } catch(e){console.error(e)}
      return
    }
    await Audio.requestPermissionsAsync()
    await Audio.setAudioModeAsync({allowsRecordingIOS:true,playsInSilentModeIOS:true})
    const {recording:rec}=await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
    setRecording(rec); setIsRecording(true); setRecordingTime(0)
    recordingTimer.current=setInterval(()=>setRecordingTime(p=>p+1),1000)
  }
  async function stopRecording() {
    clearInterval(recordingTimer.current); setRecordingTime(0); setIsRecording(false)
    if(Platform.OS==='web'){recording.stop();setRecording(null);return}
    await recording.stopAndUnloadAsync()
    setPreview({type:'audio',uri:recording.getURI(),name:'Голосовое'})
    setRecording(null)
  }
  async function playAudio(url) {
    if(Platform.OS==='web'){new window.Audio(url).play();return}
    if(playingSound){await playingSound.unloadAsync();setPlayingSound(null);return}
    const {sound}=await Audio.Sound.createAsync({uri:url})
    setPlayingSound(sound); await sound.playAsync()
    sound.setOnPlaybackStatusUpdate(st=>{if(st.didJustFinish){sound.unloadAsync();setPlayingSound(null)}})
  }

  async function searchUser() {
    setSearchError(''); setSearchResult(null)
    if(!searchNick.trim()) return
    const snap=await get(ref(db,'users')); const data=snap.val()||{}
    const found=Object.entries(data).find(([uid,v])=>v.nickname?.toLowerCase()===searchNick.trim().toLowerCase()&&uid!==user.uid)
    if(found) setSearchResult({uid:found[0],nickname:found[1].nickname,avatar:found[1].avatar||null})
    else setSearchError('Пользователь не найден')
  }
  async function addContact() {
    if(!searchResult) return
    await set(ref(db,'contacts/'+user.uid+'/'+searchResult.uid),true)
    setAddModal(false); setSearchNick(''); setSearchResult(null)
  }
  async function saveNickname() {
    if(!newNick.trim()||!user) return
    await set(ref(db,'users/'+user.uid+'/nickname'),newNick.trim())
    setUserNick(newNick.trim())
  }

  // ── RENDER MESSAGE ──────────────────────────────────────────────────────────
  function renderMessage({item}) {
    const isMine = item.uid===user?.uid
    // canAct: own message OR admin in group
    const canAct = isMine || amGroupAdmin
    const timeStr = new Date(item.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})

    return (
      <TouchableOpacity
        activeOpacity={canAct ? 0.82 : 1}
        onLongPress={()=> canAct && handleLongPress(item)}
        delayLongPress={350}
        style={{alignSelf:isMine?'flex-end':'flex-start',maxWidth:'78%',marginVertical:2,marginHorizontal:10}}
      >
        <View style={[s.bubble, isMine
          ? {backgroundColor:t.msgMine, borderBottomRightRadius:2}
          : {backgroundColor:t.msgOther, borderBottomLeftRadius:2}
        ]}>
          {!isMine && screen==='groupchat' && (
            <Text style={{color:t.nick,fontWeight:'700',fontSize:12,marginBottom:3}}>{item.user}</Text>
          )}
          {item.type==='audio' ? (
            <TouchableOpacity style={s.audioRow} onPress={()=>playAudio(item.audioUrl||item.fileUrl)}>
              <View style={[s.playBtn,{backgroundColor:isMine?'#4caf84':t.tabActive}]}>
                <Text style={{color:'#fff',fontSize:12,fontWeight:'700'}}>▶</Text>
              </View>
              <View style={s.audioTrack}>
                <View style={[s.audioFill,{backgroundColor:isMine?'#4caf84':t.tabActive,width:'55%'}]} />
              </View>
              <Text style={{color:isMine?t.msgMineTime:t.msgOtherTime,fontSize:12}}>0:00</Text>
            </TouchableOpacity>
          ) : item.type==='image' ? (
            <TouchableOpacity onPress={()=>Linking.openURL(item.fileUrl)}>
              <Image source={{uri:item.fileUrl}} style={s.msgImage} contentFit="cover" />
            </TouchableOpacity>
          ) : item.type==='file' ? (
            <TouchableOpacity onPress={()=>Linking.openURL(item.fileUrl)} style={s.fileRow}>
              <View style={[s.fileIcon,{backgroundColor:isMine?'#4caf84':t.tabActive}]}>
                <Text style={{color:'#fff',fontSize:13,fontWeight:'700'}}>⎘</Text>
              </View>
              <View style={{flex:1}}>
                <Text style={{color:isMine?t.msgMineText:t.msgOtherText,fontSize:14,fontWeight:'500'}} numberOfLines={2}>{item.text}</Text>
                <Text style={{color:isMine?t.msgMineTime:t.msgOtherTime,fontSize:11}}>Файл</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <Text style={{color:isMine?t.msgMineText:t.msgOtherText,fontSize:15,lineHeight:21}}>{item.text}</Text>
          )}
          <View style={s.msgMeta}>
            {item.edited && <Text style={{color:isMine?t.msgMineTime:t.msgOtherTime,fontSize:11,fontStyle:'italic',marginRight:2}}>изм.</Text>}
            <Text style={{color:isMine?t.msgMineTime:t.msgOtherTime,fontSize:11}}>{timeStr}</Text>
            {isMine && <Text style={{color:t.checkColor,fontSize:11,marginLeft:2}}>✓✓</Text>}
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  // ── SIDEBAR ──────────────────────────────────────────────────────────────────
  const SidebarEl = () => (
    <>
      <TouchableOpacity style={s.sidebarOverlay} onPress={closeSidebar} activeOpacity={1} />
      <Animated.View style={[s.sidebar,{backgroundColor:t.sidebarBg,transform:[{translateX:sidebarAnim}]}]}>
        <View style={[s.sidebarHeader,{backgroundColor:t.header}]}>
          <Avatar url={userAvatar} letter={userNick?.[0]||'?'} size={58} />
          <Text style={s.sidebarNick}>{userNick}</Text>
          <Text style={s.sidebarEmail}>{user?.email}</Text>
        </View>
        <TouchableOpacity style={s.sidebarItem} onPress={()=>{closeSidebar();setScreen('contacts')}}>
          <Text style={[s.sidebarIcon,{color:t.tabActive}]}>◱</Text>
          <Text style={[s.sidebarItemText,{color:t.sidebarText}]}>Чаты</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.sidebarItem} onPress={()=>{closeSidebar();setScreen('favorites')}}>
          <Text style={[s.sidebarIcon,{color:t.favColor}]}>★</Text>
          <Text style={[s.sidebarItemText,{color:t.sidebarText}]}>Избранное</Text>
        </TouchableOpacity>
        <View style={[s.sidebarDivider,{backgroundColor:t.divider}]} />
        <TouchableOpacity style={s.sidebarItem} onPress={()=>{closeSidebar();setScreen('settings')}}>
          <Text style={[s.sidebarIcon,{color:t.contactSub}]}>⚙</Text>
          <Text style={[s.sidebarItemText,{color:t.sidebarText}]}>Настройки</Text>
        </TouchableOpacity>
        <View style={[s.sidebarDivider,{backgroundColor:t.divider}]} />
        <TouchableOpacity style={s.sidebarItem} onPress={()=>{closeSidebar();auth.signOut()}}>
          <Text style={[s.sidebarIcon,{color:t.danger}]}>↪</Text>
          <Text style={[s.sidebarItemText,{color:t.danger}]}>Выйти</Text>
        </TouchableOpacity>
      </Animated.View>
    </>
  )

  // ── AUTH ─────────────────────────────────────────────────────────────────────
  if (screen==='auth') return (
    <View style={[s.auth,{backgroundColor:t.authBg}]}>
      <View style={{alignItems:'center',marginBottom:36}}>
        <View style={{width:88,height:88,borderRadius:44,backgroundColor:t.header,justifyContent:'center',alignItems:'center',marginBottom:14}}>
          <Text style={{fontSize:38,color:'#fff'}}>✉</Text>
        </View>
        <Text style={{fontSize:28,fontWeight:'800',color:t.title}}>FireMes</Text>
        <Text style={{color:t.contactSub,fontSize:14,marginTop:4}}>Войди или создай аккаунт</Text>
      </View>
      <TextInput style={[s.inp,{backgroundColor:t.input,borderColor:t.inputBorder,color:t.inputText}]}
        placeholder="Почта" placeholderTextColor={t.placeholder} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      {isRegister && (
        <TextInput style={[s.inp,{backgroundColor:t.input,borderColor:t.inputBorder,color:t.inputText}]}
          placeholder="Никнейм" placeholderTextColor={t.placeholder} value={nickname} onChangeText={setNickname} />
      )}
      <TextInput style={[s.inp,{backgroundColor:t.input,borderColor:t.inputBorder,color:t.inputText}]}
        placeholder="Пароль" placeholderTextColor={t.placeholder} value={password} onChangeText={setPassword} secureTextEntry />
      <TouchableOpacity style={[s.btn,{backgroundColor:t.header}]} onPress={async()=>{
        if(isRegister){
          if(!email||!nickname||!password) return
          const u=await createUserWithEmailAndPassword(auth,email,password)
          await set(ref(db,'users/'+u.user.uid),{nickname})
        } else {
          if(!email||!password) return
          await signInWithEmailAndPassword(auth,email,password)
        }
      }}>
        <Text style={s.btnText}>{isRegister?'Зарегистрироваться':'Войти'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={()=>setIsRegister(!isRegister)} style={{marginTop:12}}>
        <Text style={{color:t.title,textAlign:'center',fontSize:14}}>
          {isRegister?'Уже есть аккаунт? Войти':'Нет аккаунта? Зарегистрироваться'}
        </Text>
      </TouchableOpacity>
    </View>
  )

  // ── SETTINGS ─────────────────────────────────────────────────────────────────
  if (screen==='settings') return (
    <View style={[s.container,{backgroundColor:t.settingsBg}]}>
      <View style={[s.header,{backgroundColor:t.header}]}>
        <TouchableOpacity onPress={()=>setScreen('contacts')} style={{marginRight:8}}>
          <Text style={{fontSize:18,fontWeight:'700',color:'#fff'}}>←</Text>
        </TouchableOpacity>
        <Text style={{fontSize:18,fontWeight:'700',color:'#fff',flex:1}}>Настройки</Text>
        <TouchableOpacity onPress={openSidebar}>
          <Text style={{fontSize:20,color:'#fff'}}>☰</Text>
        </TouchableOpacity>
      </View>
      <View style={[{flexDirection:'row',alignItems:'center',padding:20},t.settingsItem&&{backgroundColor:t.settingsItem}]}>
        <View style={{position:'relative'}}>
          <Avatar url={userAvatar} letter={userNick?.[0]||'?'} size={80} onPress={changeAvatar} />
          <View style={[s.editBadge,{backgroundColor:t.header}]}><Text style={{color:'#fff',fontSize:11}}>✎</Text></View>
        </View>
        <View style={{marginLeft:16}}>
          <Text style={{color:t.contactText,fontSize:18,fontWeight:'700'}}>{userNick}</Text>
          <Text style={{color:t.contactSub,fontSize:13,marginTop:2}}>{user?.email}</Text>
          {avatarUploading && <Text style={{color:t.contactSub,fontSize:12,marginTop:2}}>[...] Загрузка</Text>}
        </View>
      </View>
      <View style={[s.settingsSection,{backgroundColor:t.settingsItem}]}>
        <Text style={[s.secLabel,{color:t.contactSub}]}>НИКНЕЙМ</Text>
        <View style={{flexDirection:'row',gap:8,alignItems:'center'}}>
          <TextInput style={[s.inp,{flex:1,backgroundColor:t.input,borderColor:t.inputBorder,color:t.inputText,marginBottom:0}]}
            value={newNick} onChangeText={setNewNick} placeholder="Новый никнейм" placeholderTextColor={t.placeholder} />
          <TouchableOpacity style={[s.btn,{backgroundColor:t.header,paddingVertical:10,paddingHorizontal:14}]} onPress={saveNickname}>
            <Text style={s.btnText}>Сохранить</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={[s.settingsSection,{backgroundColor:t.settingsItem,marginTop:10}]}>
        <Text style={[s.secLabel,{color:t.contactSub}]}>ОФОРМЛЕНИЕ</Text>
        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
          <Text style={{color:t.contactText,fontSize:16}}>◑ Тёмная тема</Text>
          <Switch value={isDark} onValueChange={setIsDark} trackColor={{false:'#ccc',true:t.header}} thumbColor="#fff" />
        </View>
      </View>
      <View style={[s.settingsSection,{backgroundColor:t.settingsItem,marginTop:10}]}>
        <Text style={[s.secLabel,{color:t.contactSub}]}>УВЕДОМЛЕНИЯ</Text>
        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
          <Text style={{color:t.contactText,fontSize:16}}>◎ Уведомления</Text>
          <Switch value={notifications} onValueChange={setNotifications} trackColor={{false:'#ccc',true:t.header}} thumbColor="#fff" />
        </View>
      </View>
      {sidebarOpen && <SidebarEl />}
    </View>
  )

  // ── CHAT / GROUPCHAT / FAVORITES ─────────────────────────────────────────────
  if (screen==='chat'||screen==='groupchat'||screen==='favorites') {
    const isFav = screen==='favorites'
    const isGroup = screen==='groupchat'
    const gData = currentGroupData||selectedGroup
    const title = isFav?'Избранное':isGroup?(gData?.name||''):selectedContact?.nickname||''
    const avatarLetter = isFav?'*':title?.[0]||'?'
    const avatarUrl = isFav?null:isGroup?(gData?.avatar||null):(selectedContact?.avatar||null)
    const avatarClr = isFav?t.favColor:acol(title||'x')

    return (
      <KeyboardAvoidingView style={[s.container,{backgroundColor:t.chatBg}]} behavior={Platform.OS==='ios'?'padding':'height'}>

        {/* Header */}
        <View style={[s.header,{backgroundColor:t.header}]}>
          <TouchableOpacity onPress={()=>{setScreen('contacts');setPreview(null);setEditingMsg(null)}} style={{marginRight:8}}>
            <Text style={{fontSize:18,fontWeight:'700',color:'#fff'}}>←</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{flex:1,flexDirection:'row',alignItems:'center',gap:10}}
            onPress={()=>isGroup&&setGroupMembersModal(true)}
            activeOpacity={isGroup?0.7:1}
          >
            <Avatar url={avatarUrl} letter={avatarLetter} size={38} color={avatarClr} />
            <View>
              <Text style={{fontSize:17,fontWeight:'700',color:'#fff'}}>{title}</Text>
              <Text style={{color:t.headerSub,fontSize:12}}>
                {isFav?'только для тебя':isGroup?`${Object.keys(gData?.members||{}).length} участников`:''}
              </Text>
            </View>
          </TouchableOpacity>
          {isGroup && amGroupAdmin && (
            <TouchableOpacity onPress={openEditGroup} style={{padding:6}}>
              <Text style={{color:'#fff',fontSize:16}}>✎</Text>
            </TouchableOpacity>
          )}
          {isGroup && (
            <TouchableOpacity onPress={leaveGroup} style={{padding:6}}>
              <Text style={{color:'rgba(255,255,255,0.7)',fontSize:16}}>⇤</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Group description */}
        {isGroup && gData?.description ? (
          <View style={[{paddingHorizontal:16,paddingVertical:6,borderBottomWidth:StyleSheet.hairlineWidth},{backgroundColor:isDark?'#1e2a38':'#dceefb',borderBottomColor:t.divider}]}>
            <Text style={{color:t.nick,fontSize:12}} numberOfLines={1}>{gData.description}</Text>
          </View>
        ) : null}

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={m=>m.key}
          onContentSizeChange={()=>flatListRef.current?.scrollToEnd({animated:false})}
          contentContainerStyle={{paddingVertical:8}}
          renderItem={renderMessage}
          ListEmptyComponent={isFav ? (
            <View style={{alignItems:'center',marginTop:80,paddingHorizontal:40}}>
              <View style={{width:80,height:80,borderRadius:40,backgroundColor:t.favColor,justifyContent:'center',alignItems:'center',marginBottom:18}}>
                <Text style={{fontSize:34,color:'#fff'}}>★</Text>
              </View>
              <Text style={{color:t.contactText,fontSize:20,fontWeight:'700',marginBottom:10}}>Избранное</Text>
              <Text style={{color:t.contactSub,textAlign:'center',fontSize:14,lineHeight:21}}>
                Сохраняй сюда ссылки,{'\n'}заметки и важные сообщения.{'\n'}Видно только тебе.
              </Text>
            </View>
          ) : null}
        />

        {uploading && (
          <View style={{backgroundColor:t.header,padding:8,alignItems:'center'}}>
            <Text style={{color:'#fff',fontSize:13}}>[...] Загрузка файла...</Text>
          </View>
        )}

        {/* Preview */}
        {preview && (
          <View style={[s.previewBox,{backgroundColor:t.previewBg,borderTopColor:t.inputAreaBorder}]}>
            <View style={{flex:1,flexDirection:'row',alignItems:'center',gap:10}}>
              {preview.type==='image'
                ? <Image source={{uri:preview.uri}} style={s.previewImg} contentFit="cover" />
                : <View style={{width:54,height:54,borderRadius:8,backgroundColor:t.header+'22',justifyContent:'center',alignItems:'center'}}>
                    <Text style={{fontSize:20,color:t.header}}>{preview.type==='audio'?'♪':'⎘'}</Text>
                  </View>
              }
              <Text style={{color:t.contactText,flex:1,fontSize:13}} numberOfLines={2}>{preview.name}</Text>
            </View>
            <TouchableOpacity onPress={()=>setPreview(null)} style={{padding:6}}>
              <Text style={{color:t.contactSub,fontSize:18}}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Input */}
        <View style={[s.inputArea,{backgroundColor:t.inputArea,borderTopColor:t.inputAreaBorder}]}>
          {isRecording ? (
            <View style={s.recRow}>
              <View style={s.recDot} />
              <Text style={s.recTime}>{Math.floor(recordingTime/60)}:{String(recordingTime%60).padStart(2,'0')}</Text>
              <View style={s.recTrack}><View style={[s.recFill,{width:`${Math.min(recordingTime*3,100)}%`}]} /></View>
              <TouchableOpacity onPress={stopRecording} style={[s.sendBtn,{backgroundColor:'#ff3b30'}]}>
                <Text style={{color:'#fff',fontSize:14,fontWeight:'700'}}>■</Text>
              </TouchableOpacity>
            </View>
          ) : editingMsg ? (
            <View style={[s.editBar,{borderTopColor:t.editBarColor}]}>
              <View style={{width:3,borderRadius:2,backgroundColor:t.editBarColor,alignSelf:'stretch',minHeight:36,marginRight:8}} />
              <View style={{flex:1}}>
                <Text style={{color:t.editBarColor,fontSize:12,fontWeight:'600',marginBottom:3}}>✎ Редактирование</Text>
                <TextInput style={[s.msgInput,{borderColor:t.inputBorder,backgroundColor:t.input,color:t.inputText}]}
                  value={editText} onChangeText={setEditText} autoFocus placeholder="Текст..." placeholderTextColor={t.placeholder} />
              </View>
              <TouchableOpacity style={[s.sendBtn,{backgroundColor:'#34c759',marginLeft:6}]} onPress={saveEdit}>
                <Text style={{color:'#fff',fontSize:18,fontWeight:'700'}}>V</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.sendBtn,{backgroundColor:t.contactSub,marginLeft:4}]} onPress={()=>{setEditingMsg(null);setEditText('')}}>
                <Text style={{color:'#fff',fontSize:16,fontWeight:'700'}}>X</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{flexDirection:'row',alignItems:'center',gap:4}}>
              <TouchableOpacity onPress={pickFile} style={s.iconBtn}>
                <Text style={{fontSize:20,color:t.contactSub}}>⊕</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={startRecording} style={s.iconBtn}>
                <Text style={{fontSize:20,color:t.contactSub}}>⏺</Text>
              </TouchableOpacity>
              {!preview ? (
                <TextInput style={[s.msgInput,{borderColor:t.inputBorder,backgroundColor:t.input,color:t.inputText}]}
                  value={text} onChangeText={setText} placeholder="Сообщение..." placeholderTextColor={t.placeholder} multiline />
              ) : <View style={{flex:1}} />}
              <TouchableOpacity style={[s.sendBtn,{backgroundColor:(text.trim()||preview)?t.sendBtn:t.contactSub+'66'}]} onPress={sendMessage}>
                <Text style={{color:'#fff',fontSize:18,fontWeight:'700'}}>{'>'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Modal: Members */}
        <Modal visible={groupMembersModal} transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={[s.modal,{backgroundColor:t.modalBg}]}>
              <View style={{flexDirection:'row',alignItems:'center',marginBottom:14}}>
                <Text style={{color:t.contactText,fontSize:20,fontWeight:'700',flex:1}}>
                  Участники ({Object.keys(gData?.members||{}).length})
                </Text>
                {amGroupAdmin && (
                  <TouchableOpacity style={[{backgroundColor:t.header,paddingHorizontal:12,paddingVertical:8,borderRadius:8}]}
                    onPress={()=>{setGroupMembersModal(false);setAddMemberModal(true)}}>
                    <Text style={{color:'#fff',fontWeight:'700',fontSize:13}}>＋ Добавить</Text>
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView style={{maxHeight:380}}>
                {Object.keys(gData?.members||{}).map(uid=>(
                  <MemberRow key={uid} uid={uid} t={t}
                    isOwner={uid===gData?.createdBy}
                    isAdminMember={!!gData?.admins?.[uid]}
                    isSelf={uid===user?.uid}
                    amAdmin={amGroupAdmin}
                    onToggleAdmin={()=>toggleAdmin(uid)}
                    onRemove={()=>removeMember(uid)}
                  />
                ))}
              </ScrollView>
              <TouchableOpacity onPress={()=>setGroupMembersModal(false)} style={{marginTop:14}}>
                <Text style={{color:t.tabActive,textAlign:'center',fontWeight:'600'}}>Закрыть</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Modal: Add member */}
        <Modal visible={addMemberModal} transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={[s.modal,{backgroundColor:t.modalBg}]}>
              <Text style={{color:t.contactText,fontSize:20,fontWeight:'700',marginBottom:14}}>＋ Добавить участника</Text>
              <TextInput style={[s.inp,{backgroundColor:t.input,borderColor:t.inputBorder,color:t.inputText}]}
                placeholder="Никнейм" placeholderTextColor={t.placeholder} value={addMemberNick} onChangeText={setAddMemberNick} />
              <TouchableOpacity style={[s.btn,{backgroundColor:t.header}]} onPress={searchUserForGroup}>
                <Text style={s.btnText}>Найти</Text>
              </TouchableOpacity>
              {addMemberError ? <Text style={{color:t.danger,textAlign:'center',marginTop:8}}>{addMemberError}</Text> : null}
              {addMemberResult && (
                <View style={{flexDirection:'row',alignItems:'center',paddingVertical:10,marginTop:6}}>
                  <Avatar url={addMemberResult.avatar} letter={addMemberResult.nickname[0]} size={40} />
                  <Text style={{color:t.contactText,flex:1,marginLeft:10,fontSize:15,fontWeight:'500'}}>{addMemberResult.nickname}</Text>
                  <TouchableOpacity style={{backgroundColor:t.header,paddingHorizontal:12,paddingVertical:8,borderRadius:8}} onPress={addMemberToGroup}>
                    <Text style={{color:'#fff',fontWeight:'700',fontSize:13}}>Добавить</Text>
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity onPress={()=>{setAddMemberModal(false);setAddMemberNick('');setAddMemberResult(null);setAddMemberError('')}} style={{marginTop:14}}>
                <Text style={{color:t.tabActive,textAlign:'center',fontWeight:'600'}}>Закрыть</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Modal: Edit group */}
        <Modal visible={editGroupModal} transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={[s.modal,{backgroundColor:t.modalBg}]}>
              <Text style={{color:t.contactText,fontSize:20,fontWeight:'700',marginBottom:14}}>✎ Редактировать группу</Text>
              <View style={{alignItems:'center',marginBottom:18}}>
                <TouchableOpacity onPress={pickGroupAvatar} style={{position:'relative'}}>
                  <Avatar url={editGroupAvatar} letter={editGroupName?.[0]||'?'} size={76} />
                  <View style={[s.editBadge,{backgroundColor:t.header}]}><Text style={{color:'#fff',fontSize:11}}>✎</Text></View>
                </TouchableOpacity>
                {editGroupAvatarUploading && <Text style={{color:t.contactSub,fontSize:12,marginTop:6}}>[...] Загрузка</Text>}
              </View>
              <TextInput style={[s.inp,{backgroundColor:t.input,borderColor:t.inputBorder,color:t.inputText}]}
                placeholder="Название группы" placeholderTextColor={t.placeholder} value={editGroupName} onChangeText={setEditGroupName} />
              <TextInput style={[s.inp,{backgroundColor:t.input,borderColor:t.inputBorder,color:t.inputText,minHeight:80,textAlignVertical:'top'}]}
                placeholder="Описание..." placeholderTextColor={t.placeholder} value={editGroupDesc} onChangeText={setEditGroupDesc} multiline numberOfLines={3} />
              <TouchableOpacity style={[s.btn,{backgroundColor:t.header}]} onPress={saveEditGroup}>
                <Text style={s.btnText}>Сохранить</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>setEditGroupModal(false)} style={{marginTop:8}}>
                <Text style={{color:t.tabActive,textAlign:'center',fontWeight:'600'}}>Закрыть</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </KeyboardAvoidingView>
    )
  }

  // ── CONTACTS / GROUPS LIST ────────────────────────────────────────────────────
  return (
    <View style={[s.container,{backgroundColor:t.bg}]}>
      <View style={[s.header,{backgroundColor:t.header}]}>
        <TouchableOpacity onPress={openSidebar}>
          <Text style={{fontSize:20,color:'#fff'}}>☰</Text>
        </TouchableOpacity>
        <Text style={{fontSize:18,fontWeight:'700',color:'#fff',flex:1,marginLeft:14}}>FireMes</Text>
        <TouchableOpacity onPress={()=>setScreen('favorites')} style={{marginRight:10}}>
          <Text style={{fontSize:20,color:t.favColor}}>★</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={()=>tab==='chats'?setAddModal(true):setCreateGroupModal(true)}>
          <Text style={{fontSize:26,color:'#fff',fontWeight:'300',lineHeight:28}}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={[s.tabs,{backgroundColor:t.header}]}>
        {['chats','groups'].map(tabKey=>(
          <TouchableOpacity key={tabKey}
            style={[s.tab, tab===tabKey && {borderBottomColor:'#fff',borderBottomWidth:2}]}
            onPress={()=>setTab(tabKey)}>
            <Text style={{color:tab===tabKey?'#fff':'rgba(255,255,255,0.55)',fontWeight:'600',fontSize:14}}>
              {tabKey==='chats'?'Чаты':'Группы'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab==='chats' ? (
        <FlatList
          data={contacts} keyExtractor={c=>c.uid}
          ItemSeparatorComponent={()=><View style={{height:StyleSheet.hairlineWidth,backgroundColor:t.divider,marginLeft:74}} />}
          renderItem={({item})=>(
            <TouchableOpacity style={[s.row,{backgroundColor:t.contactBg}]} onPress={()=>{setSelectedContact(item);setScreen('chat')}}>
              <Avatar url={item.avatar} letter={item.nickname[0]} size={50} />
              <View style={{flex:1,marginLeft:14}}>
                <Text style={{fontSize:16,fontWeight:'600',color:t.contactText}}>{item.nickname}</Text>
                <Text style={{fontSize:13,color:t.contactSub,marginTop:2}}>Нажми чтобы написать</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={{color:t.contactSub,textAlign:'center',marginTop:48,fontSize:15}}>Нажми ＋ чтобы добавить контакт</Text>}
        />
      ) : (
        <FlatList
          data={groups} keyExtractor={g=>g.id}
          ItemSeparatorComponent={()=><View style={{height:StyleSheet.hairlineWidth,backgroundColor:t.divider,marginLeft:74}} />}
          renderItem={({item})=>(
            <TouchableOpacity style={[s.row,{backgroundColor:t.contactBg}]}
              onPress={()=>{setSelectedGroup(item);setCurrentGroupData(item);setScreen('groupchat')}}>
              <Avatar url={item.avatar||null} letter={item.name[0]} size={50} />
              <View style={{flex:1,marginLeft:14}}>
                <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
                  <Text style={{fontSize:16,fontWeight:'600',color:t.contactText}}>{item.name}</Text>
                  {item.admins?.[user?.uid] && (
                    <View style={{backgroundColor:item.createdBy===user?.uid?t.favColor:t.adminColor,paddingHorizontal:6,paddingVertical:2,borderRadius:6}}>
                      <Text style={{color:'#fff',fontSize:9,fontWeight:'700'}}>
                        {item.createdBy===user?.uid?'СОЗДАТЕЛЬ':'ADMIN'}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{fontSize:13,color:t.contactSub,marginTop:2}} numberOfLines={1}>
                  {item.description||`${Object.keys(item.members||{}).length} участников`}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={{color:t.contactSub,textAlign:'center',marginTop:48,fontSize:15}}>Нажми ＋ чтобы создать группу</Text>}
        />
      )}

      {/* Modal: Add contact */}
      <Modal visible={addModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modal,{backgroundColor:t.modalBg}]}>
            <Text style={{color:t.contactText,fontSize:20,fontWeight:'700',marginBottom:14}}>⌕ Найти пользователя</Text>
            <TextInput style={[s.inp,{backgroundColor:t.input,borderColor:t.inputBorder,color:t.inputText}]}
              placeholder="Никнейм" placeholderTextColor={t.placeholder} value={searchNick} onChangeText={setSearchNick} />
            <TouchableOpacity style={[s.btn,{backgroundColor:t.header}]} onPress={searchUser}>
              <Text style={s.btnText}>Найти</Text>
            </TouchableOpacity>
            {searchError ? <Text style={{color:t.danger,textAlign:'center',marginTop:8}}>{searchError}</Text> : null}
            {searchResult && (
              <View style={{flexDirection:'row',alignItems:'center',paddingVertical:10,marginTop:6}}>
                <Avatar url={searchResult.avatar} letter={searchResult.nickname[0]} size={44} />
                <Text style={{color:t.contactText,flex:1,marginLeft:12,fontSize:15,fontWeight:'500'}}>{searchResult.nickname}</Text>
                <TouchableOpacity style={{backgroundColor:t.header,paddingHorizontal:12,paddingVertical:8,borderRadius:8}} onPress={addContact}>
                  <Text style={{color:'#fff',fontWeight:'700',fontSize:13}}>Добавить</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity onPress={()=>{setAddModal(false);setSearchNick('');setSearchResult(null);setSearchError('')}} style={{marginTop:14}}>
              <Text style={{color:t.tabActive,textAlign:'center',fontWeight:'600'}}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: Create group */}
      <Modal visible={createGroupModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modal,{backgroundColor:t.modalBg}]}>
            <Text style={{color:t.contactText,fontSize:20,fontWeight:'700',marginBottom:14}}>⊞ Создать группу</Text>
            <TextInput style={[s.inp,{backgroundColor:t.input,borderColor:t.inputBorder,color:t.inputText}]}
              placeholder="Название группы" placeholderTextColor={t.placeholder} value={groupName} onChangeText={setGroupName} />
            <TextInput style={[s.inp,{backgroundColor:t.input,borderColor:t.inputBorder,color:t.inputText}]}
              placeholder="Описание (необязательно)" placeholderTextColor={t.placeholder} value={groupDesc} onChangeText={setGroupDesc} />
            <Text style={[s.secLabel,{color:t.contactSub,marginBottom:8}]}>УЧАСТНИКИ</Text>
            <ScrollView style={{maxHeight:200}}>
              {contacts.map(c=>{
                const sel=groupMembersForCreate.includes(c.uid)
                return (
                  <TouchableOpacity key={c.uid}
                    style={[s.row,{backgroundColor:sel?(isDark?'#1e3a5f':'#dceefb'):'transparent',paddingVertical:8}]}
                    onPress={()=>setGroupMembersForCreate(p=>sel?p.filter(x=>x!==c.uid):[...p,c.uid])}>
                    <Avatar url={c.avatar} letter={c.nickname[0]} size={38} />
                    <Text style={{color:t.contactText,flex:1,marginLeft:12,fontSize:15,fontWeight:'500'}}>{c.nickname}</Text>
                    <Text style={{fontSize:16,color:t.tabActive}}>{sel?'✓':''}</Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
            <TouchableOpacity style={[s.btn,{backgroundColor:t.header,marginTop:12}]} onPress={createGroup}>
              <Text style={s.btnText}>Создать</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>{setCreateGroupModal(false);setGroupName('');setGroupDesc('');setGroupMembersForCreate([])}} style={{marginTop:8}}>
              <Text style={{color:t.tabActive,textAlign:'center',fontWeight:'600'}}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {sidebarOpen && <SidebarEl />}
    </View>
  )
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex:1 },
  auth: { flex:1, padding:24, justifyContent:'center' },
  inp: { borderWidth:1, borderRadius:10, padding:12, marginBottom:10, fontSize:15 },
  btn: { padding:14, borderRadius:10, alignItems:'center', marginTop:4, marginBottom:4 },
  btnText: { color:'#fff', fontWeight:'700', fontSize:15 },

  header: { paddingTop: Platform.OS==='ios'?50:14, paddingBottom:12, paddingHorizontal:16, flexDirection:'row', alignItems:'center' },
  tabs: { flexDirection:'row', paddingHorizontal:16, paddingBottom:2 },
  tab: { paddingHorizontal:18, paddingVertical:8, marginRight:4, borderBottomWidth:2, borderBottomColor:'transparent' },

  row: { flexDirection:'row', paddingHorizontal:16, paddingVertical:12, alignItems:'center' },

  bubble: { paddingHorizontal:10, paddingVertical:7, borderRadius:16, minWidth:60 },
  msgMeta: { flexDirection:'row', alignItems:'center', justifyContent:'flex-end', marginTop:3, gap:2 },
  msgImage: { width:210, height:210, borderRadius:12 },
  audioRow: { flexDirection:'row', alignItems:'center', gap:8, minWidth:160 },
  playBtn: { width:34, height:34, borderRadius:17, justifyContent:'center', alignItems:'center' },
  audioTrack: { flex:1, height:3, backgroundColor:'#ccc', borderRadius:2, overflow:'hidden' },
  audioFill: { height:3, borderRadius:2 },
  fileRow: { flexDirection:'row', alignItems:'center', gap:10, minWidth:160 },
  fileIcon: { width:40, height:40, borderRadius:8, justifyContent:'center', alignItems:'center' },

  inputArea: { paddingHorizontal:10, paddingVertical:8, borderTopWidth:StyleSheet.hairlineWidth },
  iconBtn: { width:38, height:38, justifyContent:'center', alignItems:'center' },
  msgInput: { flex:1, borderWidth:1, borderRadius:22, paddingHorizontal:14, paddingVertical:8, fontSize:15, maxHeight:100 },
  sendBtn: { width:44, height:44, borderRadius:22, justifyContent:'center', alignItems:'center' },
  editBar: { flexDirection:'row', alignItems:'center', gap:6, borderTopWidth:2, paddingTop:6, flex:1 },

  recRow: { flex:1, flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal:4 },
  recDot: { width:10, height:10, borderRadius:5, backgroundColor:'#ff3b30' },
  recTime: { color:'#ff3b30', fontWeight:'700', fontSize:14, minWidth:38 },
  recTrack: { flex:1, height:4, backgroundColor:'#ddd', borderRadius:2, overflow:'hidden' },
  recFill: { height:4, backgroundColor:'#ff3b30', borderRadius:2 },

  previewBox: { flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingVertical:10, borderTopWidth:StyleSheet.hairlineWidth },
  previewImg: { width:54, height:54, borderRadius:8 },

  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' },
  modal: { padding:20, borderTopLeftRadius:20, borderTopRightRadius:20, maxHeight:'88%' },

  memberRow: { flexDirection:'row', alignItems:'center', paddingVertical:10, borderBottomWidth:StyleSheet.hairlineWidth },
  memberBtn: { paddingHorizontal:10, paddingVertical:6, borderRadius:8 },

  sidebarOverlay: { position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.45)', zIndex:10 },
  sidebar: { position:'absolute', top:0, left:0, bottom:0, width:290, zIndex:11, elevation:12 },
  sidebarHeader: { padding:20, paddingTop:Platform.OS==='ios'?54:24, paddingBottom:16 },
  sidebarNick: { color:'#fff', fontSize:18, fontWeight:'700', marginTop:10 },
  sidebarEmail: { color:'rgba(255,255,255,0.65)', fontSize:13, marginTop:3 },
  sidebarItem: { flexDirection:'row', alignItems:'center', paddingHorizontal:20, paddingVertical:14, gap:14 },
  sidebarIcon: { fontSize:15, fontWeight:'700', width:28, textAlign:'center' },
  sidebarItemText: { fontSize:16, fontWeight:'500' },
  sidebarDivider: { height:StyleSheet.hairlineWidth, marginHorizontal:20, marginVertical:4 },

  editBadge: { position:'absolute', bottom:0, right:0, width:22, height:22, borderRadius:11, justifyContent:'center', alignItems:'center' },
  settingsSection: { paddingHorizontal:16, paddingVertical:14, marginBottom:2 },
  secLabel: { fontSize:11, fontWeight:'700', letterSpacing:1, marginBottom:10 },
})