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

// ── Google Material Design 3 palette ────────────────────────────────────────
const M3 = {
  light: {
    // surfaces
    bg:            '#fffbfe',
    surface:       '#fffbfe',
    surfaceVar:    '#e7e0ec',
    surfaceContLo: '#f7f2fa',
    surfaceContHi: '#ece6f0',
    // primary
    primary:       '#6750a4',
    onPrimary:     '#ffffff',
    primaryCont:   '#eaddff',
    onPrimaryCont: '#21005d',
    // secondary
    secondary:     '#625b71',
    onSecondary:   '#ffffff',
    secondaryCont: '#e8def8',
    // tertiary
    tertiary:      '#7e5260',
    tertiaryColor: '#b5838d',
    // error
    error:         '#b3261e',
    errorCont:     '#f9dedc',
    // outline
    outline:       '#79747e',
    outlineVar:    '#cac4d0',
    // on-surface
    onSurface:     '#1c1b1f',
    onSurfaceVar:  '#49454f',
    // chat bubbles
    msgMine:       '#eaddff',
    msgMineText:   '#21005d',
    msgMineTime:   'rgba(33,0,93,0.5)',
    msgOther:      '#ffffff',
    msgOtherText:  '#1c1b1f',
    msgOtherTime:  '#79747e',
    // misc
    favColor:      '#f59e0b',
    checkColor:    '#6750a4',
    adminColor:    '#b45309',
    divider:       '#e6e1e5',
    shadow:        'rgba(0,0,0,0.08)',
  },
  dark: {
    bg:            '#1c1b1f',
    surface:       '#1c1b1f',
    surfaceVar:    '#4a4458',
    surfaceContLo: '#2b2930',
    surfaceContHi: '#36343b',
    primary:       '#d0bcff',
    onPrimary:     '#381e72',
    primaryCont:   '#4f378b',
    onPrimaryCont: '#eaddff',
    secondary:     '#ccc2dc',
    onSecondary:   '#332d41',
    secondaryCont: '#4a4458',
    tertiary:      '#efb8c8',
    tertiaryColor: '#7e5260',
    error:         '#f2b8b5',
    errorCont:     '#8c1d18',
    outline:       '#938f99',
    outlineVar:    '#49454f',
    onSurface:     '#e6e1e5',
    onSurfaceVar:  '#cac4d0',
    msgMine:       '#4f378b',
    msgMineText:   '#eaddff',
    msgMineTime:   'rgba(234,221,255,0.55)',
    msgOther:      '#2b2930',
    msgOtherText:  '#e6e1e5',
    msgOtherTime:  '#938f99',
    favColor:      '#fbbf24',
    checkColor:    '#d0bcff',
    adminColor:    '#fcd34d',
    divider:       '#49454f',
    shadow:        'rgba(0,0,0,0.3)',
  }
}

const AV_COLORS = ['#6750a4','#b5838d','#4f7942','#b45309','#0369a1','#be185d','#047857','#7c3aed']
function acol(s) { let h=0; for(let i=0;i<s.length;i++) h=s.charCodeAt(i)+((h<<5)-h); return AV_COLORS[Math.abs(h)%AV_COLORS.length] }
function getChatId(a,b) { return [a,b].sort().join('_') }

async function uploadToCloudinary(uriOrFile) {
  const fd = new FormData()
  if (Platform.OS==='web') { fd.append('file', uriOrFile) }
  else { fd.append('file', { uri:uriOrFile, name:uriOrFile.split('/').pop(), type:'application/octet-stream' }) }
  fd.append('upload_preset', CLOUDINARY_PRESET)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/auto/upload`, { method:'POST', body:fd })
  return (await res.json()).secure_url
}

// ── Material Avatar ──────────────────────────────────────────────────────────
function Avatar({ url, letter, size=44, onPress, color }) {
  const bg = color || (letter ? acol(letter) : '#6750a4')
  const el = (
    <View style={{
      width:size, height:size, borderRadius:size/2,
      backgroundColor:bg, justifyContent:'center', alignItems:'center',
      overflow:'hidden', elevation:2,
      shadowColor:'#000', shadowOpacity:0.15, shadowRadius:3, shadowOffset:{width:0,height:1}
    }}>
      {url
        ? <Image source={{uri:url}} style={{width:size,height:size}} contentFit="cover" />
        : <Text style={{color:'#fff',fontWeight:'600',fontSize:size*0.38,letterSpacing:0.5}}>{letter?.toUpperCase()}</Text>
      }
    </View>
  )
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.82}>{el}</TouchableOpacity> : el
}

// ── Material FAB ─────────────────────────────────────────────────────────────
function FAB({ icon, onPress, color, style }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={[{
        width:56, height:56, borderRadius:16, backgroundColor:color,
        justifyContent:'center', alignItems:'center',
        elevation:6, shadowColor:'#000', shadowOpacity:0.25, shadowRadius:8, shadowOffset:{width:0,height:3}
      }, style]}>
      <Text style={{fontSize:24, color:'#fff'}}>{icon}</Text>
    </TouchableOpacity>
  )
}

// ── Material Chip ─────────────────────────────────────────────────────────────
function Chip({ label, color, textColor }) {
  return (
    <View style={{
      paddingHorizontal:10, paddingVertical:3, borderRadius:8,
      backgroundColor:color
    }}>
      <Text style={{color:textColor, fontSize:10, fontWeight:'700', letterSpacing:0.5}}>{label}</Text>
    </View>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function confirm(msg, onYes, yesLabel='Удалить') {
  if (Platform.OS==='web') { if(window.confirm(msg)) onYes(); return }
  Alert.alert('', msg, [{text:'Отмена',style:'cancel'},{text:yesLabel,style:'destructive',onPress:onYes}])
}
function msgMenu(options, onSelect) {
  if (Platform.OS==='web') {
    const n = parseInt(window.prompt(options.map((o,i)=>`${i+1}. ${o.label}`).join('\n')),10)
    if(!isNaN(n) && n>=1 && n<=options.length) onSelect(options[n-1]); return
  }
  Alert.alert('','',[
    ...options.map(o=>({text:o.label,style:o.danger?'destructive':'default',onPress:()=>onSelect(o)})),
    {text:'Отмена',style:'cancel'}
  ])
}

// ── MemberRow ─────────────────────────────────────────────────────────────────
function MemberRow({ uid, t, isOwner, isAdminMember, isSelf, amAdmin, onToggleAdmin, onRemove }) {
  const [info, setInfo] = useState(null)
  useEffect(() => {
    const unsub = onValue(ref(db,'users/'+uid), snap => { if(snap.val()) setInfo(snap.val()) })
    return ()=>unsub()
  }, [uid])
  if (!info) return null
  return (
    <View style={{flexDirection:'row', alignItems:'center', paddingVertical:12, paddingHorizontal:16, borderBottomWidth:StyleSheet.hairlineWidth, borderBottomColor:t.divider}}>
      <Avatar url={info.avatar||null} letter={info.nickname?.[0]||'?'} size={44} />
      <View style={{flex:1, marginLeft:14}}>
        <Text style={{color:t.onSurface, fontSize:15, fontWeight:'500'}}>{info.nickname}</Text>
        <Text style={{fontSize:12, marginTop:1,
          color: isOwner?t.favColor : isAdminMember?t.adminColor : t.onSurfaceVar}}>
          {isOwner ? '♛  Создатель' : isAdminMember ? '✦  Администратор' : '·  Участник'}
        </Text>
      </View>
      {amAdmin && !isSelf && !isOwner && (
        <View style={{flexDirection:'row', gap:6}}>
          <TouchableOpacity
            style={{paddingHorizontal:10, paddingVertical:6, borderRadius:20,
              backgroundColor:isAdminMember ? t.surfaceContHi : t.primaryCont}}
            onPress={onToggleAdmin}>
            <Text style={{color:isAdminMember?t.onSurfaceVar:t.onPrimaryCont, fontSize:11, fontWeight:'600'}}>
              {isAdminMember?'Снять':'Админ'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{paddingHorizontal:10, paddingVertical:6, borderRadius:20, backgroundColor:t.errorCont}}
            onPress={onRemove}>
            <Text style={{color:t.error, fontSize:11, fontWeight:'600'}}>Удалить</Text>
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
  const [authError, setAuthError] = useState('')

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

  const t = isDark ? M3.dark : M3.light

  const amGroupAdmin = !!(
    screen==='groupchat' && user && currentGroupData &&
    (currentGroupData.createdBy===user.uid || currentGroupData.admins?.[user.uid])
  )

  function openSidebar() {
    setSidebarOpen(true)
    Animated.timing(sidebarAnim,{toValue:0,duration:250,useNativeDriver:true}).start()
  }
  function closeSidebar() {
    Animated.timing(sidebarAnim,{toValue:-300,duration:250,useNativeDriver:true}).start(()=>setSidebarOpen(false))
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

  function handleLongPress(item) {
    const isMine = item.uid===user?.uid
    const canDelete = isMine || amGroupAdmin
    const canEdit = isMine && item.type==='text'
    if (!canDelete && !canEdit) return
    const opts = []
    if (canEdit) opts.push({label:'✎  Редактировать',action:'edit'})
    if (canDelete) opts.push({label:'⌫  Удалить',action:'delete',danger:true})
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
      name:groupName.trim(), description:groupDesc.trim(),
      createdBy:user.uid, admins:{[user.uid]:true},
      members, createdAt:Date.now()
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

  // ── Material TextField ──────────────────────────────────────────────────────
  function MField({ label, value, onChange, secure, keyboard, autoCapitalize }) {
    const [focused, setFocused] = useState(false)
    return (
      <View style={{marginBottom:16}}>
        <Text style={{fontSize:12, fontWeight:'500', color:focused?t.primary:t.onSurfaceVar, marginBottom:4, letterSpacing:0.4}}>{label}</Text>
        <TextInput
          style={{
            borderWidth: focused?2:1,
            borderColor: focused?t.primary:t.outline,
            borderRadius:4, paddingHorizontal:14, paddingVertical:12,
            fontSize:15, color:t.onSurface, backgroundColor:t.surface,
          }}
          value={value} onChangeText={onChange}
          secureTextEntry={secure} keyboardType={keyboard||'default'}
          autoCapitalize={autoCapitalize||'sentences'}
          onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
          placeholderTextColor={t.onSurfaceVar}
        />
      </View>
    )
  }

  // ── Material Button ─────────────────────────────────────────────────────────
  function MBtn({ label, onPress, variant='filled', style }) {
    const bg = variant==='filled' ? t.primary : variant==='tonal' ? t.secondaryCont : 'transparent'
    const fg = variant==='filled' ? t.onPrimary : variant==='tonal' ? t.onSurface : t.primary
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.82}
        style={[{
          borderRadius:100, paddingVertical:12, paddingHorizontal:24,
          alignItems:'center', backgroundColor:bg,
          borderWidth: variant==='outlined'?1:0,
          borderColor: variant==='outlined'?t.outline:'transparent',
          elevation: variant==='filled'?2:0,
        }, style]}>
        <Text style={{color:fg, fontWeight:'600', fontSize:14, letterSpacing:0.1}}>{label}</Text>
      </TouchableOpacity>
    )
  }

  // ── Modal shell ─────────────────────────────────────────────────────────────
  function MSheet({ visible, onClose, title, children }) {
    return (
      <Modal visible={visible} transparent animationType="slide">
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.4)',justifyContent:'flex-end'}}>
          <View style={{
            backgroundColor:t.surface, borderTopLeftRadius:28, borderTopRightRadius:28,
            padding:24, maxHeight:'90%',
          }}>
            {/* drag handle */}
            <View style={{width:32,height:4,borderRadius:2,backgroundColor:t.outlineVar,alignSelf:'center',marginBottom:20}} />
            {title && <Text style={{fontSize:20,fontWeight:'600',color:t.onSurface,marginBottom:20}}>{title}</Text>}
            {children}
            <TouchableOpacity onPress={onClose} style={{marginTop:16}}>
              <Text style={{color:t.primary,textAlign:'center',fontWeight:'600',fontSize:14}}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    )
  }

  // ── Render message ──────────────────────────────────────────────────────────
  function renderMessage({item}) {
    const isMine = item.uid===user?.uid
    const canAct = isMine || amGroupAdmin
    const timeStr = new Date(item.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})

    return (
      <TouchableOpacity
        activeOpacity={canAct?0.82:1}
        onLongPress={()=>canAct&&handleLongPress(item)}
        delayLongPress={350}
        style={{alignSelf:isMine?'flex-end':'flex-start', maxWidth:'78%', marginVertical:2, marginHorizontal:12}}
      >
        <View style={{
          backgroundColor: isMine ? t.msgMine : t.msgOther,
          borderRadius:18,
          borderBottomRightRadius: isMine?4:18,
          borderBottomLeftRadius: isMine?18:4,
          paddingHorizontal:12, paddingVertical:8,
          elevation:1, shadowColor:t.shadow, shadowOpacity:0.3, shadowRadius:2, shadowOffset:{width:0,height:1}
        }}>
          {!isMine && screen==='groupchat' && (
            <Text style={{color:t.primary,fontWeight:'700',fontSize:12,marginBottom:2}}>{item.user}</Text>
          )}
          {item.type==='audio' ? (
            <TouchableOpacity style={{flexDirection:'row',alignItems:'center',gap:10,minWidth:160}} onPress={()=>playAudio(item.audioUrl||item.fileUrl)}>
              <View style={{width:36,height:36,borderRadius:18,backgroundColor:isMine?t.primary:t.primaryCont,justifyContent:'center',alignItems:'center'}}>
                <Text style={{color:isMine?t.onPrimary:t.onPrimaryCont,fontSize:14}}>▶</Text>
              </View>
              <View style={{flex:1,height:3,backgroundColor:t.outlineVar,borderRadius:2,overflow:'hidden'}}>
                <View style={{height:3,width:'55%',backgroundColor:isMine?t.primary:t.secondary,borderRadius:2}} />
              </View>
              <Text style={{color:isMine?t.msgMineTime:t.msgOtherTime,fontSize:12}}>0:00</Text>
            </TouchableOpacity>
          ) : item.type==='image' ? (
            <TouchableOpacity onPress={()=>Linking.openURL(item.fileUrl)}>
              <Image source={{uri:item.fileUrl}} style={{width:210,height:210,borderRadius:12}} contentFit="cover" />
            </TouchableOpacity>
          ) : item.type==='file' ? (
            <TouchableOpacity onPress={()=>Linking.openURL(item.fileUrl)}
              style={{flexDirection:'row',alignItems:'center',gap:12,minWidth:160,
                backgroundColor:isMine?t.primaryCont:t.surfaceContLo, borderRadius:12, padding:10}}>
              <View style={{width:40,height:40,borderRadius:12,backgroundColor:isMine?t.primary:t.secondary,justifyContent:'center',alignItems:'center'}}>
                <Text style={{color:'#fff',fontSize:16}}>⎘</Text>
              </View>
              <View style={{flex:1}}>
                <Text style={{color:isMine?t.msgMineText:t.msgOtherText,fontSize:13,fontWeight:'500'}} numberOfLines={2}>{item.text}</Text>
                <Text style={{color:isMine?t.msgMineTime:t.msgOtherTime,fontSize:11,marginTop:1}}>Файл</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <Text style={{color:isMine?t.msgMineText:t.msgOtherText,fontSize:15,lineHeight:21}}>{item.text}</Text>
          )}
          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',marginTop:3,gap:3}}>
            {item.edited && <Text style={{color:isMine?t.msgMineTime:t.msgOtherTime,fontSize:10,fontStyle:'italic'}}>изм.</Text>}
            <Text style={{color:isMine?t.msgMineTime:t.msgOtherTime,fontSize:10}}>{timeStr}</Text>
            {isMine && <Text style={{color:t.checkColor,fontSize:11}}>✓✓</Text>}
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  // ── Sidebar (Navigation Drawer) ─────────────────────────────────────────────
  const SidebarEl = () => (
    <>
      <TouchableOpacity style={{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.4)',zIndex:10}} onPress={closeSidebar} activeOpacity={1} />
      <Animated.View style={{
        position:'absolute',top:0,left:0,bottom:0,width:290,zIndex:11,
        backgroundColor:t.surfaceContLo,
        elevation:16, shadowColor:'#000', shadowOpacity:0.3, shadowRadius:16,
        transform:[{translateX:sidebarAnim}]
      }}>
        {/* Drawer header */}
        <View style={{backgroundColor:t.primaryCont, padding:20, paddingTop:Platform.OS==='ios'?54:28, paddingBottom:20}}>
          <Avatar url={userAvatar} letter={userNick?.[0]||'?'} size={60} />
          <Text style={{color:t.onPrimaryCont,fontSize:17,fontWeight:'700',marginTop:12}}>{userNick}</Text>
          <Text style={{color:t.onPrimaryCont,fontSize:13,marginTop:2,opacity:0.75}}>{user?.email}</Text>
        </View>
        {/* Drawer items */}
        {[
          {icon:'★', label:'Избранное', color:t.favColor, onPress:()=>{closeSidebar();setScreen('favorites')}},
          {icon:'⚙', label:'Настройки', color:t.onSurfaceVar, onPress:()=>{closeSidebar();setScreen('settings')}},
        ].map(item=>(
          <TouchableOpacity key={item.label} onPress={item.onPress}
            style={{flexDirection:'row',alignItems:'center',paddingHorizontal:20,paddingVertical:16,gap:16,borderRadius:100,marginHorizontal:8,marginTop:4}}>
            <Text style={{fontSize:20,color:item.color,width:28,textAlign:'center'}}>{item.icon}</Text>
            <Text style={{fontSize:15,fontWeight:'500',color:t.onSurface}}>{item.label}</Text>
          </TouchableOpacity>
        ))}
        <View style={{height:1,backgroundColor:t.divider,marginHorizontal:20,marginVertical:8}} />
        <TouchableOpacity onPress={()=>{closeSidebar();auth.signOut()}}
          style={{flexDirection:'row',alignItems:'center',paddingHorizontal:20,paddingVertical:16,gap:16,borderRadius:100,marginHorizontal:8}}>
          <Text style={{fontSize:20,color:t.error,width:28,textAlign:'center'}}>↪</Text>
          <Text style={{fontSize:15,fontWeight:'500',color:t.error}}>Выйти</Text>
        </TouchableOpacity>
      </Animated.View>
    </>
  )

  // ── AUTH ─────────────────────────────────────────────────────────────────────
  if (screen==='auth') return (
    <View style={{flex:1,backgroundColor:t.bg,justifyContent:'center',padding:28}}>
      <View style={{alignItems:'center',marginBottom:40}}>
        <View style={{width:80,height:80,borderRadius:20,backgroundColor:t.primary,justifyContent:'center',alignItems:'center',marginBottom:16,
          elevation:4,shadowColor:t.primary,shadowOpacity:0.4,shadowRadius:12,shadowOffset:{width:0,height:4}}}>
          <Text style={{fontSize:36,color:t.onPrimary}}>✉</Text>
        </View>
        <Text style={{fontSize:26,fontWeight:'700',color:t.onSurface,letterSpacing:-0.3}}>FireMes</Text>
        <Text style={{color:t.onSurfaceVar,fontSize:14,marginTop:6}}>{isRegister?'Создай аккаунт':'Добро пожаловать'}</Text>
      </View>
      <MField label="Почта" value={email} onChange={setEmail} keyboard="email-address" autoCapitalize="none" />
      {isRegister && <MField label="Никнейм" value={nickname} onChange={setNickname} />}
      <MField label="Пароль" value={password} onChange={setPassword} secure />
      {authError ? <Text style={{color:t.error,fontSize:13,marginBottom:12,marginTop:-8}}>{authError}</Text> : null}
      <MBtn label={isRegister?'Зарегистрироваться':'Войти'} onPress={async()=>{
        setAuthError('')
        try {
          if(isRegister){
            if(!email||!nickname||!password){setAuthError('Заполни все поля');return}
            const u=await createUserWithEmailAndPassword(auth,email,password)
            await set(ref(db,'users/'+u.user.uid),{nickname})
          } else {
            if(!email||!password){setAuthError('Заполни все поля');return}
            await signInWithEmailAndPassword(auth,email,password)
          }
        } catch(e){ setAuthError(e.message) }
      }} style={{marginTop:8}} />
      <TouchableOpacity onPress={()=>{setIsRegister(!isRegister);setAuthError('')}} style={{marginTop:20}}>
        <Text style={{color:t.primary,textAlign:'center',fontSize:14,fontWeight:'500'}}>
          {isRegister?'Уже есть аккаунт? Войти':'Нет аккаунта? Зарегистрироваться'}
        </Text>
      </TouchableOpacity>
    </View>
  )

  // ── SETTINGS ─────────────────────────────────────────────────────────────────
  if (screen==='settings') return (
    <View style={{flex:1,backgroundColor:t.bg}}>
      {/* Top App Bar */}
      <View style={{backgroundColor:t.surface,paddingTop:Platform.OS==='ios'?50:14,paddingBottom:14,paddingHorizontal:16,flexDirection:'row',alignItems:'center',
        elevation:0,borderBottomWidth:1,borderBottomColor:t.divider}}>
        <TouchableOpacity onPress={()=>setScreen('contacts')} style={{marginRight:12,padding:4}}>
          <Text style={{fontSize:22,color:t.onSurface}}>←</Text>
        </TouchableOpacity>
        <Text style={{fontSize:20,fontWeight:'600',color:t.onSurface,flex:1}}>Настройки</Text>
        <TouchableOpacity onPress={openSidebar} style={{padding:4}}>
          <Text style={{fontSize:22,color:t.onSurface}}>☰</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{flex:1}}>
        {/* Profile card */}
        <View style={{backgroundColor:t.primaryCont,margin:16,borderRadius:16,padding:20,flexDirection:'row',alignItems:'center',
          elevation:1,shadowColor:t.shadow,shadowOpacity:1,shadowRadius:4,shadowOffset:{width:0,height:1}}}>
          <View style={{position:'relative'}}>
            <Avatar url={userAvatar} letter={userNick?.[0]||'?'} size={72} onPress={changeAvatar} />
            <View style={{position:'absolute',bottom:0,right:0,width:22,height:22,borderRadius:11,
              backgroundColor:t.primary,justifyContent:'center',alignItems:'center'}}>
              <Text style={{color:t.onPrimary,fontSize:11}}>✎</Text>
            </View>
          </View>
          <View style={{marginLeft:16,flex:1}}>
            <Text style={{color:t.onPrimaryCont,fontSize:19,fontWeight:'700'}}>{userNick}</Text>
            <Text style={{color:t.onPrimaryCont,fontSize:13,marginTop:2,opacity:0.75}}>{user?.email}</Text>
            {avatarUploading && <Text style={{color:t.onPrimaryCont,fontSize:12,marginTop:4,opacity:0.7}}>Загрузка...</Text>}
          </View>
        </View>

        {/* Nick section */}
        <View style={{backgroundColor:t.surface,marginHorizontal:16,marginBottom:12,borderRadius:16,padding:16,
          elevation:1,shadowColor:t.shadow,shadowOpacity:1,shadowRadius:2,shadowOffset:{width:0,height:1}}}>
          <Text style={{fontSize:11,fontWeight:'700',color:t.primary,letterSpacing:1,marginBottom:12}}>НИКНЕЙМ</Text>
          <View style={{flexDirection:'row',gap:10,alignItems:'center'}}>
            <TextInput style={{flex:1,borderWidth:1,borderColor:t.outline,borderRadius:4,paddingHorizontal:12,paddingVertical:10,fontSize:15,color:t.onSurface,backgroundColor:t.surface}}
              value={newNick} onChangeText={setNewNick} placeholder="Новый никнейм" placeholderTextColor={t.onSurfaceVar} />
            <MBtn label="Сохранить" onPress={saveNickname} style={{paddingVertical:10,paddingHorizontal:16}} />
          </View>
        </View>

        {/* Toggles */}
        <View style={{backgroundColor:t.surface,marginHorizontal:16,marginBottom:12,borderRadius:16,overflow:'hidden',
          elevation:1,shadowColor:t.shadow,shadowOpacity:1,shadowRadius:2,shadowOffset:{width:0,height:1}}}>
          {[
            {label:'◑  Тёмная тема', value:isDark, onChange:setIsDark},
            {label:'◎  Уведомления', value:notifications, onChange:setNotifications},
          ].map((row,i)=>(
            <View key={row.label} style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',
              padding:16, borderBottomWidth:i===0?StyleSheet.hairlineWidth:0, borderBottomColor:t.divider}}>
              <Text style={{color:t.onSurface,fontSize:15}}>{row.label}</Text>
              <Switch value={row.value} onValueChange={row.onChange}
                trackColor={{false:t.outlineVar,true:t.primary}} thumbColor="#fff" />
            </View>
          ))}
        </View>
      </ScrollView>
      {sidebarOpen && <SidebarEl />}
    </View>
  )

  // ── CHAT / GROUPCHAT / FAVORITES ─────────────────────────────────────────────
  if (screen==='chat'||screen==='groupchat'||screen==='favorites') {
    const isFav = screen==='favorites'
    const isGroup = screen==='groupchat'
    const gData = currentGroupData||selectedGroup
    const title = isFav?'Избранное':isGroup?(gData?.name||''):selectedContact?.nickname||''
    const avatarLetter = isFav?'★':title?.[0]||'?'
    const avatarUrl = isFav?null:isGroup?(gData?.avatar||null):(selectedContact?.avatar||null)
    const avatarClr = isFav?t.favColor:acol(title||'x')

    return (
      <KeyboardAvoidingView style={{flex:1,backgroundColor:t.bg}} behavior={Platform.OS==='ios'?'padding':'height'}>

        {/* Top App Bar */}
        <View style={{backgroundColor:t.surface,paddingTop:Platform.OS==='ios'?50:14,paddingBottom:12,
          paddingHorizontal:16,flexDirection:'row',alignItems:'center',
          elevation:2,shadowColor:'#000',shadowOpacity:0.08,shadowRadius:4,shadowOffset:{width:0,height:2},
          borderBottomWidth:1,borderBottomColor:t.divider}}>
          <TouchableOpacity onPress={()=>{setScreen('contacts');setPreview(null);setEditingMsg(null)}} style={{marginRight:8,padding:4}}>
            <Text style={{fontSize:22,color:t.onSurface}}>←</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{flex:1,flexDirection:'row',alignItems:'center',gap:12}}
            onPress={()=>isGroup&&setGroupMembersModal(true)}
            activeOpacity={isGroup?0.7:1}>
            <Avatar url={avatarUrl} letter={avatarLetter} size={40} color={avatarClr} />
            <View style={{flex:1}}>
              <Text style={{fontSize:16,fontWeight:'600',color:t.onSurface}}>{title}</Text>
              <Text style={{color:t.onSurfaceVar,fontSize:12,marginTop:1}}>
                {isFav?'только для тебя':isGroup?`${Object.keys(gData?.members||{}).length} участников`:''}
              </Text>
            </View>
          </TouchableOpacity>
          {isGroup && amGroupAdmin && (
            <TouchableOpacity onPress={openEditGroup} style={{padding:8}}>
              <Text style={{fontSize:18,color:t.onSurfaceVar}}>✎</Text>
            </TouchableOpacity>
          )}
          {isGroup && (
            <TouchableOpacity onPress={leaveGroup} style={{padding:8}}>
              <Text style={{fontSize:18,color:t.onSurfaceVar}}>⇤</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Group description */}
        {isGroup && gData?.description ? (
          <View style={{paddingHorizontal:16,paddingVertical:8,backgroundColor:t.primaryCont,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:t.divider}}>
            <Text style={{color:t.onPrimaryCont,fontSize:12}} numberOfLines={1}>{gData.description}</Text>
          </View>
        ) : null}

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={m=>m.key}
          onContentSizeChange={()=>flatListRef.current?.scrollToEnd({animated:false})}
          contentContainerStyle={{paddingVertical:12}}
          renderItem={renderMessage}
          style={{backgroundColor:t.bg}}
          ListEmptyComponent={isFav ? (
            <View style={{alignItems:'center',marginTop:80,paddingHorizontal:40}}>
              <View style={{width:88,height:88,borderRadius:22,backgroundColor:t.primaryCont,justifyContent:'center',alignItems:'center',marginBottom:20,
                elevation:2,shadowColor:t.shadow,shadowOpacity:1,shadowRadius:6}}>
                <Text style={{fontSize:40,color:t.primary}}>★</Text>
              </View>
              <Text style={{color:t.onSurface,fontSize:20,fontWeight:'700',marginBottom:10}}>Избранное</Text>
              <Text style={{color:t.onSurfaceVar,textAlign:'center',fontSize:14,lineHeight:22}}>
                Сохраняй ссылки, заметки{'\n'}и важные сообщения.{'\n'}Видно только тебе.
              </Text>
            </View>
          ) : null}
        />

        {/* Upload bar */}
        {uploading && (
          <View style={{backgroundColor:t.primaryCont,padding:10,alignItems:'center'}}>
            <Text style={{color:t.onPrimaryCont,fontSize:13}}>Загрузка файла...</Text>
          </View>
        )}

        {/* Preview */}
        {preview && (
          <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingVertical:10,
            backgroundColor:t.surfaceContLo,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:t.divider}}>
            <View style={{flex:1,flexDirection:'row',alignItems:'center',gap:12}}>
              {preview.type==='image'
                ? <Image source={{uri:preview.uri}} style={{width:52,height:52,borderRadius:10}} contentFit="cover" />
                : <View style={{width:52,height:52,borderRadius:12,backgroundColor:t.primaryCont,justifyContent:'center',alignItems:'center'}}>
                    <Text style={{fontSize:22,color:t.primary}}>{preview.type==='audio'?'♪':'⎘'}</Text>
                  </View>
              }
              <Text style={{color:t.onSurface,flex:1,fontSize:13}} numberOfLines={2}>{preview.name}</Text>
            </View>
            <TouchableOpacity onPress={()=>setPreview(null)} style={{padding:8}}>
              <Text style={{color:t.onSurfaceVar,fontSize:18}}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Input area */}
        <View style={{backgroundColor:t.surface,paddingHorizontal:12,paddingVertical:10,
          borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:t.divider}}>
          {isRecording ? (
            <View style={{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:t.errorCont,borderRadius:28,paddingHorizontal:14,paddingVertical:10}}>
              <View style={{width:10,height:10,borderRadius:5,backgroundColor:t.error}} />
              <Text style={{color:t.error,fontWeight:'700',fontSize:14,minWidth:38}}>
                {Math.floor(recordingTime/60)}:{String(recordingTime%60).padStart(2,'0')}
              </Text>
              <View style={{flex:1,height:3,backgroundColor:t.outlineVar,borderRadius:2,overflow:'hidden'}}>
                <View style={{height:3,width:`${Math.min(recordingTime*3,100)}%`,backgroundColor:t.error,borderRadius:2}} />
              </View>
              <TouchableOpacity onPress={stopRecording}
                style={{width:40,height:40,borderRadius:20,backgroundColor:t.error,justifyContent:'center',alignItems:'center'}}>
                <Text style={{color:'#fff',fontSize:16}}>■</Text>
              </TouchableOpacity>
            </View>
          ) : editingMsg ? (
            <View style={{flexDirection:'row',alignItems:'center',gap:8,
              backgroundColor:t.primaryCont,borderRadius:16,paddingHorizontal:14,paddingVertical:8}}>
              <View style={{width:3,borderRadius:2,backgroundColor:t.primary,alignSelf:'stretch',minHeight:36}} />
              <View style={{flex:1}}>
                <Text style={{color:t.primary,fontSize:11,fontWeight:'700',marginBottom:3,letterSpacing:0.3}}>✎  Редактирование</Text>
                <TextInput style={{color:t.onPrimaryCont,fontSize:14}}
                  value={editText} onChangeText={setEditText} autoFocus />
              </View>
              <TouchableOpacity onPress={saveEdit}
                style={{width:38,height:38,borderRadius:19,backgroundColor:t.primary,justifyContent:'center',alignItems:'center'}}>
                <Text style={{color:t.onPrimary,fontSize:18}}>✓</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>{setEditingMsg(null);setEditText('')}}
                style={{width:38,height:38,borderRadius:19,backgroundColor:t.outlineVar,justifyContent:'center',alignItems:'center'}}>
                <Text style={{color:t.onSurface,fontSize:16}}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{flexDirection:'row',alignItems:'flex-end',gap:8}}>
              <View style={{flex:1,flexDirection:'row',alignItems:'flex-end',
                backgroundColor:t.surfaceContLo,borderRadius:28,paddingHorizontal:6,paddingVertical:6,gap:4}}>
                <TouchableOpacity onPress={pickFile}
                  style={{width:34,height:34,borderRadius:17,justifyContent:'center',alignItems:'center'}}>
                  <Text style={{fontSize:19,color:t.onSurfaceVar}}>⊕</Text>
                </TouchableOpacity>
                {!preview ? (
                  <TextInput
                    style={{flex:1,fontSize:15,color:t.onSurface,paddingVertical:4,maxHeight:100}}
                    value={text} onChangeText={setText}
                    placeholder="Сообщение..." placeholderTextColor={t.onSurfaceVar} multiline />
                ) : <View style={{flex:1,height:34}} />}
                <TouchableOpacity onPress={startRecording}
                  style={{width:34,height:34,borderRadius:17,justifyContent:'center',alignItems:'center'}}>
                  <Text style={{fontSize:19,color:t.onSurfaceVar}}>⏺</Text>
                </TouchableOpacity>
              </View>
              {/* FAB send */}
              <TouchableOpacity onPress={sendMessage}
                style={{width:50,height:50,borderRadius:25,
                  backgroundColor:(text.trim()||preview)?t.primary:t.outlineVar,
                  justifyContent:'center',alignItems:'center',
                  elevation:3,shadowColor:t.primary,shadowOpacity:0.35,shadowRadius:6,shadowOffset:{width:0,height:2}}}>
                <Text style={{color:'#fff',fontSize:20}}>▶</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Sheet: Members */}
        <MSheet visible={groupMembersModal} onClose={()=>setGroupMembersModal(false)}
          title={`Участники (${Object.keys((currentGroupData||selectedGroup)?.members||{}).length})`}>
          {amGroupAdmin && (
            <MBtn label="+ Добавить участника" variant="tonal" onPress={()=>{setGroupMembersModal(false);setAddMemberModal(true)}} style={{marginBottom:16}} />
          )}
          <ScrollView style={{maxHeight:380}}>
            {Object.keys((currentGroupData||selectedGroup)?.members||{}).map(uid=>(
              <MemberRow key={uid} uid={uid} t={t}
                isOwner={uid===(currentGroupData||selectedGroup)?.createdBy}
                isAdminMember={!!(currentGroupData||selectedGroup)?.admins?.[uid]}
                isSelf={uid===user?.uid}
                amAdmin={amGroupAdmin}
                onToggleAdmin={()=>toggleAdmin(uid)}
                onRemove={()=>removeMember(uid)}
              />
            ))}
          </ScrollView>
        </MSheet>

        {/* Sheet: Add member */}
        <MSheet visible={addMemberModal} onClose={()=>{setAddMemberModal(false);setAddMemberNick('');setAddMemberResult(null);setAddMemberError('')}}
          title="+ Добавить участника">
          <MField label="Никнейм" value={addMemberNick} onChange={setAddMemberNick} />
          <MBtn label="Найти" onPress={searchUserForGroup} style={{marginBottom:12}} />
          {addMemberError ? <Text style={{color:t.error,fontSize:13,marginBottom:10}}>{addMemberError}</Text> : null}
          {addMemberResult && (
            <View style={{flexDirection:'row',alignItems:'center',padding:12,borderRadius:16,backgroundColor:t.surfaceContLo,marginBottom:4}}>
              <Avatar url={addMemberResult.avatar} letter={addMemberResult.nickname[0]} size={44} />
              <Text style={{color:t.onSurface,flex:1,marginLeft:12,fontSize:15,fontWeight:'500'}}>{addMemberResult.nickname}</Text>
              <MBtn label="Добавить" onPress={addMemberToGroup} style={{paddingVertical:8,paddingHorizontal:14}} />
            </View>
          )}
        </MSheet>

        {/* Sheet: Edit group */}
        <MSheet visible={editGroupModal} onClose={()=>setEditGroupModal(false)} title="✎  Редактировать группу">
          <View style={{alignItems:'center',marginBottom:20}}>
            <TouchableOpacity onPress={pickGroupAvatar} style={{position:'relative'}}>
              <Avatar url={editGroupAvatar} letter={editGroupName?.[0]||'?'} size={80} />
              <View style={{position:'absolute',bottom:0,right:0,width:26,height:26,borderRadius:13,
                backgroundColor:t.primary,justifyContent:'center',alignItems:'center'}}>
                <Text style={{color:t.onPrimary,fontSize:13}}>✎</Text>
              </View>
            </TouchableOpacity>
            {editGroupAvatarUploading && <Text style={{color:t.onSurfaceVar,fontSize:12,marginTop:6}}>Загрузка...</Text>}
          </View>
          <MField label="Название группы" value={editGroupName} onChange={setEditGroupName} />
          <MField label="Описание" value={editGroupDesc} onChange={setEditGroupDesc} />
          <MBtn label="Сохранить" onPress={saveEditGroup} />
        </MSheet>

      </KeyboardAvoidingView>
    )
  }

  // ── CONTACTS / GROUPS LIST ────────────────────────────────────────────────────
  return (
    <View style={{flex:1,backgroundColor:t.bg}}>
      {/* Top App Bar */}
      <View style={{backgroundColor:t.surface,paddingTop:Platform.OS==='ios'?50:14,paddingBottom:14,
        paddingHorizontal:16,flexDirection:'row',alignItems:'center',
        elevation:2,shadowColor:'#000',shadowOpacity:0.06,shadowRadius:4,shadowOffset:{width:0,height:2},
        borderBottomWidth:1,borderBottomColor:t.divider}}>
        <TouchableOpacity onPress={openSidebar} style={{padding:4,marginRight:8}}>
          <Text style={{fontSize:22,color:t.onSurface}}>☰</Text>
        </TouchableOpacity>
        <Text style={{fontSize:20,fontWeight:'700',color:t.onSurface,flex:1,letterSpacing:-0.3}}>FireMes</Text>
        <TouchableOpacity onPress={()=>setScreen('favorites')} style={{padding:8,marginRight:4}}>
          <Text style={{fontSize:22,color:t.favColor}}>★</Text>
        </TouchableOpacity>
      </View>

      {/* Material Tabs */}
      <View style={{flexDirection:'row',backgroundColor:t.surface,borderBottomWidth:1,borderBottomColor:t.divider}}>
        {['chats','groups'].map(tabKey=>(
          <TouchableOpacity key={tabKey} onPress={()=>setTab(tabKey)}
            style={{flex:1,paddingVertical:14,alignItems:'center',borderBottomWidth:3,
              borderBottomColor:tab===tabKey?t.primary:'transparent'}}>
            <Text style={{fontSize:14,fontWeight:'600',letterSpacing:0.5,
              color:tab===tabKey?t.primary:t.onSurfaceVar}}>
              {tabKey==='chats'?'ЧАТЫ':'ГРУППЫ'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab==='chats' ? (
        <FlatList
          data={contacts} keyExtractor={c=>c.uid}
          ItemSeparatorComponent={()=><View style={{height:StyleSheet.hairlineWidth,backgroundColor:t.divider,marginLeft:74}} />}
          renderItem={({item})=>(
            <TouchableOpacity style={{flexDirection:'row',paddingHorizontal:16,paddingVertical:14,alignItems:'center',backgroundColor:t.surface}}
              onPress={()=>{setSelectedContact(item);setScreen('chat')}}>
              <Avatar url={item.avatar} letter={item.nickname[0]} size={52} />
              <View style={{flex:1,marginLeft:14}}>
                <Text style={{fontSize:16,fontWeight:'600',color:t.onSurface}}>{item.nickname}</Text>
                <Text style={{fontSize:13,color:t.onSurfaceVar,marginTop:2}}>Нажми чтобы написать</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={{alignItems:'center',marginTop:60,paddingHorizontal:40}}>
              <Text style={{fontSize:40,marginBottom:12}}>💬</Text>
              <Text style={{color:t.onSurface,fontSize:17,fontWeight:'600',marginBottom:6}}>Нет чатов</Text>
              <Text style={{color:t.onSurfaceVar,textAlign:'center',fontSize:14}}>Нажми ＋ чтобы добавить контакт</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={groups} keyExtractor={g=>g.id}
          ItemSeparatorComponent={()=><View style={{height:StyleSheet.hairlineWidth,backgroundColor:t.divider,marginLeft:74}} />}
          renderItem={({item})=>(
            <TouchableOpacity style={{flexDirection:'row',paddingHorizontal:16,paddingVertical:14,alignItems:'center',backgroundColor:t.surface}}
              onPress={()=>{setSelectedGroup(item);setCurrentGroupData(item);setScreen('groupchat')}}>
              <Avatar url={item.avatar||null} letter={item.name[0]} size={52} />
              <View style={{flex:1,marginLeft:14}}>
                <View style={{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  <Text style={{fontSize:16,fontWeight:'600',color:t.onSurface}}>{item.name}</Text>
                  {item.admins?.[user?.uid] && (
                    <Chip
                      label={item.createdBy===user?.uid?'СОЗДАТЕЛЬ':'ADMIN'}
                      color={item.createdBy===user?.uid?t.primaryCont:t.secondaryCont}
                      textColor={item.createdBy===user?.uid?t.primary:t.secondary}
                    />
                  )}
                </View>
                <Text style={{fontSize:13,color:t.onSurfaceVar,marginTop:2}} numberOfLines={1}>
                  {item.description||`${Object.keys(item.members||{}).length} участников`}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={{alignItems:'center',marginTop:60,paddingHorizontal:40}}>
              <Text style={{fontSize:40,marginBottom:12}}>👥</Text>
              <Text style={{color:t.onSurface,fontSize:17,fontWeight:'600',marginBottom:6}}>Нет групп</Text>
              <Text style={{color:t.onSurfaceVar,textAlign:'center',fontSize:14}}>Нажми ＋ чтобы создать группу</Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <FAB
        icon="+"
        onPress={()=>tab==='chats'?setAddModal(true):setCreateGroupModal(true)}
        color={t.primary}
        style={{position:'absolute',bottom:24,right:20}}
      />

      {/* Sheet: Add contact */}
      <MSheet visible={addModal} onClose={()=>{setAddModal(false);setSearchNick('');setSearchResult(null);setSearchError('')}}
        title="Найти пользователя">
        <MField label="Никнейм" value={searchNick} onChange={setSearchNick} />
        <MBtn label="Найти" onPress={searchUser} style={{marginBottom:12}} />
        {searchError ? <Text style={{color:t.error,fontSize:13,marginBottom:10}}>{searchError}</Text> : null}
        {searchResult && (
          <View style={{flexDirection:'row',alignItems:'center',padding:12,borderRadius:16,backgroundColor:t.surfaceContLo,marginBottom:4}}>
            <Avatar url={searchResult.avatar} letter={searchResult.nickname[0]} size={48} />
            <Text style={{color:t.onSurface,flex:1,marginLeft:12,fontSize:15,fontWeight:'500'}}>{searchResult.nickname}</Text>
            <MBtn label="Добавить" onPress={addContact} style={{paddingVertical:8,paddingHorizontal:14}} />
          </View>
        )}
      </MSheet>

      {/* Sheet: Create group */}
      <MSheet visible={createGroupModal} onClose={()=>{setCreateGroupModal(false);setGroupName('');setGroupDesc('');setGroupMembersForCreate([])}}
        title="Создать группу">
        <MField label="Название" value={groupName} onChange={setGroupName} />
        <MField label="Описание (необязательно)" value={groupDesc} onChange={setGroupDesc} />
        <Text style={{fontSize:11,fontWeight:'700',color:t.primary,letterSpacing:1,marginBottom:10}}>УЧАСТНИКИ</Text>
        <ScrollView style={{maxHeight:180,marginBottom:12}}>
          {contacts.map(c=>{
            const sel = groupMembersForCreate.includes(c.uid)
            return (
              <TouchableOpacity key={c.uid} onPress={()=>setGroupMembersForCreate(p=>sel?p.filter(x=>x!==c.uid):[...p,c.uid])}
                style={{flexDirection:'row',alignItems:'center',paddingVertical:10,paddingHorizontal:4,borderRadius:12,
                  backgroundColor:sel?t.primaryCont:'transparent',marginBottom:2}}>
                <Avatar url={c.avatar} letter={c.nickname[0]} size={40} />
                <Text style={{color:t.onSurface,flex:1,marginLeft:12,fontSize:15,fontWeight:'500'}}>{c.nickname}</Text>
                {sel && <Text style={{color:t.primary,fontSize:18}}>✓</Text>}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
        <MBtn label="Создать группу" onPress={createGroup} />
      </MSheet>

      {sidebarOpen && <SidebarEl />}
    </View>
  )
}